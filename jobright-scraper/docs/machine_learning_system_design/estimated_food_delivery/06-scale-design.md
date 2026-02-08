# Scale Design

## Scalability Considerations

To ensure the system remains accurate and scalable as order volume grows:

1.  **Distributed Training**:
    *   Use distributed GBDT implementations (e.g., XGBoost on Spark/Ray) to handle the 6-month historical dataset.
2.  **Real-time Feature Store**:
    *   Low-latency access to "Realtime features" (Traffic, Dasher count) is critical. Use a Feature Store (e.g., Redis/Cassandra) to serve these values < 10ms.
3.  **Inference Caching**:
    *   Cache predictions for active orders to reduce compute load. Recalculate only when significant status changes occur (e.g., "Food Picked Up").
4.  **Feedback Loop**:
    *   Automated pipelines to ingest daily delivery data and re-train/fine-tune models to adapt to shifting market dynamics.
