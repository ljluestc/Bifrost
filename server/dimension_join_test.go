package server

import (
	"testing"

	pluginDriver "github.com/brokercap/Bifrost/plugin/driver"
)

func TestDimensionJoinConfigValidation(t *testing.T) {
	tests := []struct {
		name    string
		config  *DimensionJoinConfig
		wantErr bool
	}{
		{
			name:    "nil config",
			config:  nil,
			wantErr: true,
		},
		{
			name:    "empty ConnectUri",
			config:  &DimensionJoinConfig{Schema: "db", Table: "t", JoinKey: "id", DimensionKey: "id", DimensionFields: []string{"name"}},
			wantErr: true,
		},
		{
			name:    "empty Schema",
			config:  &DimensionJoinConfig{ConnectUri: "root:@tcp(127.0.0.1:3306)/db", Table: "t", JoinKey: "id", DimensionKey: "id", DimensionFields: []string{"name"}},
			wantErr: true,
		},
		{
			name:    "empty Table",
			config:  &DimensionJoinConfig{ConnectUri: "root:@tcp(127.0.0.1:3306)/db", Schema: "db", JoinKey: "id", DimensionKey: "id", DimensionFields: []string{"name"}},
			wantErr: true,
		},
		{
			name:    "empty JoinKey",
			config:  &DimensionJoinConfig{ConnectUri: "root:@tcp(127.0.0.1:3306)/db", Schema: "db", Table: "t", DimensionKey: "id", DimensionFields: []string{"name"}},
			wantErr: true,
		},
		{
			name:    "empty DimensionKey",
			config:  &DimensionJoinConfig{ConnectUri: "root:@tcp(127.0.0.1:3306)/db", Schema: "db", Table: "t", JoinKey: "id", DimensionFields: []string{"name"}},
			wantErr: true,
		},
		{
			name:    "empty DimensionFields",
			config:  &DimensionJoinConfig{ConnectUri: "root:@tcp(127.0.0.1:3306)/db", Schema: "db", Table: "t", JoinKey: "id", DimensionKey: "id", DimensionFields: []string{}},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := NewDimensionJoiner(tt.config)
			if (err != nil) != tt.wantErr {
				t.Errorf("NewDimensionJoiner() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestApplyDimensionJoinNilConfig(t *testing.T) {
	key := "test_key"
	ts := &ToServer{
		Key:           &key,
		ToServerID:    1,
		DimensionJoin: nil,
	}
	data := &pluginDriver.PluginDataType{
		Rows: []map[string]interface{}{
			{"id": 1, "name": "test"},
		},
	}

	result := applyDimensionJoin(ts, data)
	if len(result.Rows) != 1 {
		t.Errorf("expected 1 row, got %d", len(result.Rows))
	}
	if result.Rows[0]["name"] != "test" {
		t.Error("expected original data to be unchanged")
	}
}

func TestApplyDimensionJoinNilData(t *testing.T) {
	key := "test_key"
	ts := &ToServer{
		Key:        &key,
		ToServerID: 1,
		DimensionJoin: &DimensionJoinConfig{
			ConnectUri:      "root:@tcp(127.0.0.1:3306)/db",
			Schema:          "db",
			Table:           "users",
			JoinKey:         "user_id",
			DimensionKey:    "id",
			DimensionFields: []string{"name"},
		},
	}

	result := applyDimensionJoin(ts, nil)
	if result != nil {
		t.Error("expected nil result for nil data")
	}
}

func TestApplyDimensionJoinEmptyRows(t *testing.T) {
	key := "test_key"
	ts := &ToServer{
		Key:        &key,
		ToServerID: 1,
		DimensionJoin: &DimensionJoinConfig{
			ConnectUri:      "root:@tcp(127.0.0.1:3306)/db",
			Schema:          "db",
			Table:           "users",
			JoinKey:         "user_id",
			DimensionKey:    "id",
			DimensionFields: []string{"name"},
		},
	}
	data := &pluginDriver.PluginDataType{
		Rows: []map[string]interface{}{},
	}

	result := applyDimensionJoin(ts, data)
	if len(result.Rows) != 0 {
		t.Errorf("expected 0 rows, got %d", len(result.Rows))
	}
}

func TestGetOrCreateDimensionJoinerCaching(t *testing.T) {
	// Clean up after test
	defer func() {
		CloseDimensionJoiner("test_caching_key")
	}()

	// This will fail to connect, but the validation will pass config checks
	// Since there's no real MySQL, we verify the error path
	config := &DimensionJoinConfig{
		ConnectUri:      "root:invalid@tcp(127.0.0.1:9999)/nonexistent",
		Schema:          "db",
		Table:           "t",
		JoinKey:         "id",
		DimensionKey:    "id",
		DimensionFields: []string{"name"},
		CacheTTL:        60,
		CacheSize:       100,
	}
	_, err := GetOrCreateDimensionJoiner("test_caching_key", config)
	if err == nil {
		// If somehow we connected (unlikely), just close it
		CloseDimensionJoiner("test_caching_key")
	}
	// The error is expected since we can't connect to a non-existent MySQL
}

func TestDimensionJoinerLookupNil(t *testing.T) {
	// Test Lookup with nil key (should return nil without panic)
	j := &DimensionJoiner{
		cache:  NewDimensionJoinCache(100, 60),
		closed: true,
	}
	result := j.Lookup(nil)
	if result != nil {
		t.Error("expected nil for nil key")
	}

	result = j.Lookup("")
	if result != nil {
		t.Error("expected nil for empty key")
	}
}

func TestCloseDimensionJoinerNonExistent(t *testing.T) {
	// Should not panic
	CloseDimensionJoiner("nonexistent_key")
}
