package server

import (
	"container/list"
	"sync"
	"time"
)

// DimensionCacheEntry represents a single cached dimension table row.
type DimensionCacheEntry struct {
	key       string
	value     map[string]interface{}
	expireAt  time.Time
	listEntry *list.Element
}

// DimensionJoinCache is a thread-safe LRU cache with TTL for dimension table lookups.
type DimensionJoinCache struct {
	mu       sync.RWMutex
	maxSize  int
	ttl      time.Duration
	items    map[string]*DimensionCacheEntry
	eviction *list.List // front = most recently used
}

// NewDimensionJoinCache creates a new cache with the given max size and TTL (in seconds).
// If maxSize <= 0, defaults to 10000. If ttlSeconds <= 0, defaults to 300 (5 minutes).
func NewDimensionJoinCache(maxSize int, ttlSeconds int) *DimensionJoinCache {
	if maxSize <= 0 {
		maxSize = 10000
	}
	if ttlSeconds <= 0 {
		ttlSeconds = 300
	}
	return &DimensionJoinCache{
		maxSize:  maxSize,
		ttl:      time.Duration(ttlSeconds) * time.Second,
		items:    make(map[string]*DimensionCacheEntry, maxSize),
		eviction: list.New(),
	}
}

// Get returns the cached dimension row for the given key and true if found and not expired.
// Returns nil, false if not found or expired.
func (c *DimensionJoinCache) Get(key string) (map[string]interface{}, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	entry, ok := c.items[key]
	if !ok {
		return nil, false
	}
	if time.Now().After(entry.expireAt) {
		c.removeEntry(entry)
		return nil, false
	}
	// Move to front (most recently used)
	c.eviction.MoveToFront(entry.listEntry)
	return entry.value, true
}

// Set stores a dimension row in the cache.
func (c *DimensionJoinCache) Set(key string, value map[string]interface{}) {
	c.mu.Lock()
	defer c.mu.Unlock()
	now := time.Now()
	if entry, ok := c.items[key]; ok {
		entry.value = value
		entry.expireAt = now.Add(c.ttl)
		c.eviction.MoveToFront(entry.listEntry)
		return
	}
	// Evict LRU entries if at capacity
	for c.eviction.Len() >= c.maxSize {
		c.evictOldest()
	}
	entry := &DimensionCacheEntry{
		key:      key,
		value:    value,
		expireAt: now.Add(c.ttl),
	}
	entry.listEntry = c.eviction.PushFront(entry)
	c.items[key] = entry
}

// SetNotFound caches a "not found" result so we don't query again.
func (c *DimensionJoinCache) SetNotFound(key string) {
	c.Set(key, nil)
}

// Len returns the current number of entries in the cache.
func (c *DimensionJoinCache) Len() int {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return len(c.items)
}

// Clear removes all entries from the cache.
func (c *DimensionJoinCache) Clear() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.items = make(map[string]*DimensionCacheEntry, c.maxSize)
	c.eviction.Init()
}

func (c *DimensionJoinCache) removeEntry(entry *DimensionCacheEntry) {
	c.eviction.Remove(entry.listEntry)
	delete(c.items, entry.key)
}

func (c *DimensionJoinCache) evictOldest() {
	back := c.eviction.Back()
	if back == nil {
		return
	}
	entry := back.Value.(*DimensionCacheEntry)
	c.removeEntry(entry)
}
