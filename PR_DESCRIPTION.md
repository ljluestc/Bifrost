# Feature: Support MySQL to SAP HANA Data Synchronization

## Summary
This PR introduces a new plugin `hana` to support real-time data synchronization from MySQL to SAP HANA. This addresses issue #306.

## Changes
- **New Plugin**: Added `plugin/hana` directory containing the SAP HANA plugin implementation.
- **Plugin Registration**: Updated `plugin/load/import_toserver.go` to import and register the new `hana` plugin.
- **Dependencies**: Updated `go.mod` and `go.sum` to include `github.com/SAP/go-hdb`.

## Implementation Details
The plugin implements the `pluginDriver.Driver` interface and supports the following features:
- **Connection**: Uses `github.com/SAP/go-hdb/driver` to establish connections to SAP HANA.
- **Data Synchronization**: Supports `INSERT`, `UPDATE`, and `DELETE` events.
- **Batch Processing**: Implements batch commitment to ensure data consistency and performance.
- **Type Conversion**: Handles mapping between Bifrost internal data types and HANA compatible types, including JSON support for Maps/Slices.
- **Transaction Support**: Uses HANA transactions (`Begin`, `Commit`, `Rollback`) for atomic batch updates.

## Configuration
To use the HANA plugin, configure the target resource URI with the following format:
```
hdb://user:password@host:port
```

## Testing
- Unit tests are provided in `plugin/hana/src/hana_test.go`.
- Tested basic data type conversions.
- Tested schema and table name resolution.
- Verified compilation and integration with the main Bifrost server.

## Related Issue
Closes #306
