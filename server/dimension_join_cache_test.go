package server

import (
	"fmt"
	"sync"
	"testing"
	"time"
)

func TestDimensionJoinCacheDefaults(t *testing.T) {
	c := NewDimensionJoinCache(0, 0)
	if c.maxSize != 10000 {
		t.Errorf("expected default maxSize 10000, got %d", c.maxSize)
	}
	if c.ttl != 300*time.Second {
		t.Errorf("expected default ttl 300s, got %v", c.ttl)
	}
}

func TestDimensionJoinCacheSetGet(t *testing.T) {
	c := NewDimensionJoinCache(100, 60)

	row := map[string]interface{}{"name": "Alice", "age": 30}
	c.Set("1", row)

	got, ok := c.Get("1")
	if !ok {
		t.Fatal("expected cache hit")
	}
	if got["name"] != "Alice" || got["age"] != 30 {
		t.Errorf("unexpected cached value: %v", got)
	}
}

func TestDimensionJoinCacheGetMiss(t *testing.T) {
	c := NewDimensionJoinCache(100, 60)

	_, ok := c.Get("nonexistent")
	if ok {
		t.Error("expected cache miss for nonexistent key")
	}
}

func TestDimensionJoinCacheSetNotFound(t *testing.T) {
	c := NewDimensionJoinCache(100, 60)
	c.SetNotFound("missing_key")

	got, ok := c.Get("missing_key")
	if !ok {
		t.Fatal("expected cache hit for not-found entry")
	}
	if got != nil {
		t.Errorf("expected nil value for not-found entry, got %v", got)
	}
}

func TestDimensionJoinCacheTTLExpiry(t *testing.T) {
	c := NewDimensionJoinCache(100, 1) // 1 second TTL

	row := map[string]interface{}{"name": "Bob"}
	c.Set("1", row)

	// Should be found immediately
	_, ok := c.Get("1")
	if !ok {
		t.Fatal("expected cache hit before expiry")
	}

	// Wait for expiry
	time.Sleep(1100 * time.Millisecond)

	_, ok = c.Get("1")
	if ok {
		t.Error("expected cache miss after TTL expiry")
	}
}

func TestDimensionJoinCacheLRUEviction(t *testing.T) {
	c := NewDimensionJoinCache(3, 60) // max 3 entries

	c.Set("1", map[string]interface{}{"v": "a"})
	c.Set("2", map[string]interface{}{"v": "b"})
	c.Set("3", map[string]interface{}{"v": "c"})

	// Access "1" to make it recently used
	c.Get("1")

	// Adding a 4th entry should evict "2" (least recently used)
	c.Set("4", map[string]interface{}{"v": "d"})

	if _, ok := c.Get("2"); ok {
		t.Error("expected '2' to be evicted")
	}
	if _, ok := c.Get("1"); !ok {
		t.Error("expected '1' to still be cached (was recently accessed)")
	}
	if _, ok := c.Get("3"); !ok {
		t.Error("expected '3' to still be cached")
	}
	if _, ok := c.Get("4"); !ok {
		t.Error("expected '4' to still be cached")
	}
}

func TestDimensionJoinCacheUpdateExisting(t *testing.T) {
	c := NewDimensionJoinCache(100, 60)

	c.Set("1", map[string]interface{}{"v": "old"})
	c.Set("1", map[string]interface{}{"v": "new"})

	got, ok := c.Get("1")
	if !ok {
		t.Fatal("expected cache hit")
	}
	if got["v"] != "new" {
		t.Errorf("expected updated value 'new', got %v", got["v"])
	}

	// Should still be only 1 entry
	if c.Len() != 1 {
		t.Errorf("expected 1 entry, got %d", c.Len())
	}
}

func TestDimensionJoinCacheClear(t *testing.T) {
	c := NewDimensionJoinCache(100, 60)

	c.Set("1", map[string]interface{}{"v": "a"})
	c.Set("2", map[string]interface{}{"v": "b"})
	c.Clear()

	if c.Len() != 0 {
		t.Errorf("expected 0 entries after clear, got %d", c.Len())
	}
	if _, ok := c.Get("1"); ok {
		t.Error("expected cache miss after clear")
	}
}

func TestDimensionJoinCacheLen(t *testing.T) {
	c := NewDimensionJoinCache(100, 60)

	if c.Len() != 0 {
		t.Errorf("expected 0 entries, got %d", c.Len())
	}

	c.Set("1", map[string]interface{}{})
	c.Set("2", map[string]interface{}{})
	if c.Len() != 2 {
		t.Errorf("expected 2 entries, got %d", c.Len())
	}
}

func TestDimensionJoinCacheConcurrency(t *testing.T) {
	c := NewDimensionJoinCache(1000, 60)
	var wg sync.WaitGroup

	// Writers
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			for j := 0; j < 100; j++ {
				key := fmt.Sprintf("%d_%d", id, j)
				c.Set(key, map[string]interface{}{"id": id, "j": j})
			}
		}(i)
	}

	// Readers
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			for j := 0; j < 100; j++ {
				key := fmt.Sprintf("%d_%d", id, j)
				c.Get(key)
			}
		}(i)
	}

	wg.Wait()

	// Just verify no panics occurred and length is sane
	if c.Len() > 1000 {
		t.Errorf("cache length %d exceeds max size 1000", c.Len())
	}
}
