# feat: 支持 filter 插件动态字段过滤 (#220)

## 关联 Issue

Closes #220

## 背景

当前 ToServer 流程仅支持通过 FieldList 做静态字段保留，以及 FilterUpdate/FilterQuery 等固定策略。这导致插件无法在同步前按业务规则动态增删字段，也无法在插件内决定直接丢弃某条事件。

为满足 issue #220，需要在不破坏现有插件兼容性的前提下，增加可选的 filter 插件钩子能力。

## 改动概览

本次改动在 sendToServer 流程中增加"可选 filter 钩子"：

```
filterField（原有） → applyPluginFilter（新增，可选） → Insert/Update/Del/Query/Commit（原有）
```

### 1. 新增可选过滤接口

**新增文件**：`plugin/driver/filter_interface.go`

**新增接口**：

```go
type FilterPluginDriver interface {
    Filter(data *PluginDataType, retry bool) (newData *PluginDataType, keep bool, err error)
}
```

语义约定：

- `keep=false`：丢弃当前事件（视为成功跳过）
- `keep=true`：继续同步
- `keep=true` 时 `newData` 必须非空

### 2. 保持兼容：提供默认透传实现

**修改文件**：`plugin/driver/driver_interface.go`

在 `PluginDriverInterface` 增加默认 `Filter` 方法，默认返回 `(data, true, nil)`。

效果：

- 旧插件无需改动即可继续工作
- 只有显式实现 `FilterPluginDriver` 的插件才会启用动态过滤逻辑

### 3. 在发送链路接入过滤钩子

**修改文件**：`server/to_server_consume.go`

**新增方法**：`applyPluginFilter(conn, data, retry)`

处理逻辑：

- 插件未实现 `FilterPluginDriver`：直接透传
- `Filter` 返回错误：向上返回错误，沿用现有重试/错误处理链路
- `keep=false`：跳过该事件并返回成功（推进位点）
- `keep=true && newData==nil`：返回错误，防止空数据进入下游

## 使用示例

### 示例：实现一个动态过滤插件

```go
package myplugin

import pluginDriver "github.com/brokercap/Bifrost/plugin/driver"

type MyFilterPlugin struct {
    pluginDriver.PluginDriverInterface
}

// 实现 FilterPluginDriver 接口
func (p *MyFilterPlugin) Filter(data *pluginDriver.PluginDataType, retry bool) (*pluginDriver.PluginDataType, bool, error) {
    // 示例 1：删除敏感字段
    delete(data.Rows[0], "password")
    delete(data.Rows[0], "secret_key")
    
    // 示例 2：添加计算字段
    data.Rows[0]["processed_at"] = time.Now().Unix()
    
    // 示例 3：根据条件丢弃事件
    if status, ok := data.Rows[0]["status"].(string); ok && status == "deleted" {
        return nil, false, nil // keep=false，丢弃该事件
    }
    
    return data, true, nil // keep=true，继续同步
}
```

## 测试

**新增文件**：`server/to_server_consume_filter_test.go`

新增 5 个测试场景：

1. 插件未实现 filter 接口时透传
2. 动态字段变更（删除字段 + 新增字段）
3. `keep=false` 丢弃事件
4. `keep=true` 但返回 nil data 报错
5. Filter 显式返回错误

### 执行结果

```bash
go test ./server -run TestToServerApplyPluginFilter -count=1
```

通过。

```bash
go test ./plugin/driver -count=1
```

通过。

## 兼容性与风险

- **兼容性**：向后兼容，未实现过滤接口的插件行为不变
- **风险控制**：
  - 对 `keep=true && newData=nil` 做显式保护
  - 过滤接口采用可选 type assertion，不影响现有 Driver 主接口

## 变更文件

| 文件 | 变更说明 |
|------|----------|
| `plugin/driver/filter_interface.go` | 新增：定义 FilterPluginDriver 接口 |
| `plugin/driver/driver_interface.go` | 修改：增加默认 Filter 透传实现 |
| `server/to_server_consume.go` | 修改：新增 applyPluginFilter 方法，集成到发送链路 |
| `server/to_server_consume_filter_test.go` | 新增：过滤功能单元测试 |

## Summary

- Problem: ToServer only supports static FieldList filtering; plugins cannot dynamically add/remove fields or drop events before sync.
- What changed: Added optional FilterPluginDriver interface with default pass-through implementation; integrated filter hook into sendToServer flow.
- What did NOT change: Existing plugins without Filter implementation continue to work unchanged; core field list config (FieldList, FilterUpdate, FilterQuery) remains intact.

## Change Type

- [x] Feature

## Scope

- [x] Trading engine / strategies
- [x] API / server

## Linked Issues

- Closes #220

## Testing

- [x] Unit tests added for filter pass-through, field mutation, drop-event, and error cases
- [x] `go test ./server -run TestToServerApplyPluginFilter` passes
- [x] `go test ./plugin/driver` passes

## Security Impact

- Secrets/keys handling changed? **No**
- New/changed API endpoints? **No**
- User input validation affected? **No**

## Compatibility

- Backward compatible? **Yes** - plugins without Filter implementation work unchanged
- Config/env changes? **No**
- Migration needed? **No**
