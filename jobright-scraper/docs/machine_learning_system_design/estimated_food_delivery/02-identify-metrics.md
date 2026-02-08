# Metrics Design

## Offline Metrics
We use **Root Mean Squared Error (RMSE)** to measure prediction accuracy during training.

$$
RMSE = \sqrt{\frac{1}{n}\sum_{i=1}^{n}(y_i - \hat{y}_i)^2}
$$

### Limitations of RMSE
RMSE penalizes under-estimation and over-estimation equally. However, from a business perspective:
*   **Over-estimation (Model 1)**: Customer expects food in 34 mins, gets it in 30. *Result: Positive surprise, but potentially lost orders due to long estimates.*
*   **Under-estimation (Model 2)**: Customer expects food in 26 mins, gets it in 30. *Result: Negative surprise, unhappy customers.*

**Quiz Insight**:
> Although Model 1 and Model 2 have the same RMSE error, Model 1 (over-estimation) prevents customers from making orders, while Model 2 (under-estimation) causes unhappiness.
> **Deployment Strategy**: It depends. We should deploy both models and run A/B testing to measure online metrics.

## Online Metrics
1.  **Model Performance**: Real-time RMSE.
2.  **Customer Impact**:
    *   **Conversion Rate**: Do longer estimates reduce order volume?
    *   **Retention/Happiness**: Do accurate (or slightly pessimistic) estimates lead to better long-term retention?
