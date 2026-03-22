package server

import (
	"database/sql"
	"fmt"
	"log"
	"runtime/debug"
	"strings"
	"sync"

	_ "github.com/go-sql-driver/mysql"

	pluginDriver "github.com/brokercap/Bifrost/plugin/driver"
)

// DimensionJoinConfig holds configuration for joining streaming data with a dimension table.
type DimensionJoinConfig struct {
	ConnectUri      string   `json:"ConnectUri"`      // MySQL DSN for dimension table, e.g. "root:pwd@tcp(127.0.0.1:3306)/db"
	Schema          string   `json:"Schema"`          // Dimension table schema
	Table           string   `json:"Table"`           // Dimension table name
	JoinKey         string   `json:"JoinKey"`         // Field in streaming data to use as join key
	DimensionKey    string   `json:"DimensionKey"`    // Field in dimension table to match against JoinKey
	DimensionFields []string `json:"DimensionFields"` // Fields to fetch from dimension table
	FieldPrefix     string   `json:"FieldPrefix"`     // Optional prefix for dimension fields in output (default: "dim_")
	CacheTTL        int      `json:"CacheTTL"`        // Cache TTL in seconds (default: 300)
	CacheSize       int      `json:"CacheSize"`       // Max cache entries (default: 10000)
}

// DimensionJoiner performs dimension table lookups with caching.
type DimensionJoiner struct {
	mu     sync.RWMutex
	config *DimensionJoinConfig
	cache  *DimensionJoinCache
	db     *sql.DB
	query  string
	closed bool
}

var (
	dimensionJoinersMu sync.RWMutex
	dimensionJoiners   = make(map[string]*DimensionJoiner) // keyed by ToServer identifier
)

// GetOrCreateDimensionJoiner returns an existing joiner for the given key, or creates a new one.
func GetOrCreateDimensionJoiner(key string, config *DimensionJoinConfig) (*DimensionJoiner, error) {
	dimensionJoinersMu.Lock()
	defer dimensionJoinersMu.Unlock()
	if j, ok := dimensionJoiners[key]; ok {
		return j, nil
	}
	j, err := NewDimensionJoiner(config)
	if err != nil {
		return nil, err
	}
	dimensionJoiners[key] = j
	return j, nil
}

// CloseDimensionJoiner closes and removes the joiner for the given key.
func CloseDimensionJoiner(key string) {
	dimensionJoinersMu.Lock()
	defer dimensionJoinersMu.Unlock()
	if j, ok := dimensionJoiners[key]; ok {
		j.Close()
		delete(dimensionJoiners, key)
	}
}

// NewDimensionJoiner creates a new dimension table joiner.
func NewDimensionJoiner(config *DimensionJoinConfig) (*DimensionJoiner, error) {
	if config == nil {
		return nil, fmt.Errorf("dimension join config is nil")
	}
	if config.ConnectUri == "" {
		return nil, fmt.Errorf("dimension join ConnectUri is empty")
	}
	if config.Schema == "" || config.Table == "" {
		return nil, fmt.Errorf("dimension join Schema or Table is empty")
	}
	if config.JoinKey == "" || config.DimensionKey == "" {
		return nil, fmt.Errorf("dimension join JoinKey or DimensionKey is empty")
	}
	if len(config.DimensionFields) == 0 {
		return nil, fmt.Errorf("dimension join DimensionFields is empty")
	}

	db, err := sql.Open("mysql", config.ConnectUri)
	if err != nil {
		return nil, fmt.Errorf("dimension join connect error: %v", err)
	}
	db.SetMaxOpenConns(5)
	db.SetMaxIdleConns(2)

	if err = db.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("dimension join ping error: %v", err)
	}

	// Build SELECT query
	escapedFields := make([]string, len(config.DimensionFields))
	for i, f := range config.DimensionFields {
		escapedFields[i] = "`" + f + "`"
	}
	query := fmt.Sprintf("SELECT %s FROM `%s`.`%s` WHERE `%s` = ? LIMIT 1",
		strings.Join(escapedFields, ", "),
		config.Schema, config.Table, config.DimensionKey)

	j := &DimensionJoiner{
		config: config,
		cache:  NewDimensionJoinCache(config.CacheSize, config.CacheTTL),
		db:     db,
		query:  query,
	}
	return j, nil
}

// Lookup fetches a dimension row for the given join key value.
// Returns nil if no matching row is found.
func (j *DimensionJoiner) Lookup(keyValue interface{}) map[string]interface{} {
	if keyValue == nil {
		return nil
	}
	keyStr := fmt.Sprint(keyValue)
	if keyStr == "" {
		return nil
	}

	// Check cache
	if cached, ok := j.cache.Get(keyStr); ok {
		return cached
	}

	// Query dimension table
	result := j.queryDimensionTable(keyStr)
	if result != nil {
		j.cache.Set(keyStr, result)
	} else {
		j.cache.SetNotFound(keyStr)
	}
	return result
}

func (j *DimensionJoiner) queryDimensionTable(keyValue string) map[string]interface{} {
	defer func() {
		if err := recover(); err != nil {
			log.Printf("DimensionJoiner queryDimensionTable panic: %v\n%s", err, string(debug.Stack()))
		}
	}()

	j.mu.RLock()
	if j.closed {
		j.mu.RUnlock()
		return nil
	}
	j.mu.RUnlock()

	rows, err := j.db.Query(j.query, keyValue)
	if err != nil {
		log.Printf("DimensionJoiner query error: %v, key: %s", err, keyValue)
		return nil
	}
	defer rows.Close()

	cols, err := rows.Columns()
	if err != nil {
		log.Printf("DimensionJoiner columns error: %v", err)
		return nil
	}

	if !rows.Next() {
		return nil
	}

	values := make([]interface{}, len(cols))
	valuePtrs := make([]interface{}, len(cols))
	for i := range values {
		valuePtrs[i] = &values[i]
	}

	if err := rows.Scan(valuePtrs...); err != nil {
		log.Printf("DimensionJoiner scan error: %v", err)
		return nil
	}

	result := make(map[string]interface{}, len(cols))
	for i, col := range cols {
		val := values[i]
		// Convert []byte to string for readability
		if b, ok := val.([]byte); ok {
			result[col] = string(b)
		} else {
			result[col] = val
		}
	}
	return result
}

// Close releases database resources.
func (j *DimensionJoiner) Close() {
	j.mu.Lock()
	defer j.mu.Unlock()
	if j.closed {
		return
	}
	j.closed = true
	if j.db != nil {
		j.db.Close()
	}
	if j.cache != nil {
		j.cache.Clear()
	}
}

// ClearCache clears the dimension join cache.
func (j *DimensionJoiner) ClearCache() {
	if j.cache != nil {
		j.cache.Clear()
	}
}

// applyDimensionJoin enriches the plugin data by joining with the dimension table.
// It modifies each row in data.Rows by adding dimension fields with the configured prefix.
func applyDimensionJoin(toServer *ToServer, data *pluginDriver.PluginDataType) *pluginDriver.PluginDataType {
	if toServer.DimensionJoin == nil || data == nil || len(data.Rows) == 0 {
		return data
	}

	config := toServer.DimensionJoin
	joinerKey := fmt.Sprintf("%s_%d", *toServer.Key, toServer.ToServerID)

	joiner, err := GetOrCreateDimensionJoiner(joinerKey, config)
	if err != nil {
		log.Printf("DimensionJoin GetOrCreateDimensionJoiner error: %v, key: %s", err, joinerKey)
		return data
	}

	prefix := config.FieldPrefix
	if prefix == "" {
		prefix = "dim_"
	}

	for i, row := range data.Rows {
		if row == nil {
			continue
		}
		joinKeyValue, ok := row[config.JoinKey]
		if !ok {
			continue
		}
		dimRow := joiner.Lookup(joinKeyValue)
		if dimRow == nil {
			continue
		}
		// Merge dimension fields into the row with prefix
		newRow := make(map[string]interface{}, len(row)+len(dimRow))
		for k, v := range row {
			newRow[k] = v
		}
		for k, v := range dimRow {
			newRow[prefix+k] = v
		}
		data.Rows[i] = newRow
	}
	return data
}
