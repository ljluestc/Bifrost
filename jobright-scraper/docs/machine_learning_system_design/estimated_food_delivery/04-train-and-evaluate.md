# Train and Evaluate

## Model Architecture
We use **Gradient Boosted Decision Trees (GBDT)** for this regression task. GBDTs are highly effective for tabular data and can capture non-linear relationships between features (e.g., traffic vs. distance).

### Training Process (Residual Learning)
The GBDT model is trained iteratively:

1.  **Step 1: Baseline**: Calculate the average delivery time for the entire dataset. This is the initial prediction.
2.  **Step 2: Calculate Residuals**: Measure the error for the current prediction.
    $$ Error = \text{Actual Time} - \text{Estimated Time} $$
3.  **Step 3: Build Tree**: Train a decision tree to predict these *residuals* (errors).
4.  **Step 4: Update Prediction**:
    $$ \text{New Estimate} = \text{Previous Estimate} + (\text{Learning Rate} \times \text{Predicted Residual}) $$
5.  **Step 5: Iterate**: Calculate new residuals based on the updated estimate and separate steps 3-4.
6.  **Step 6: Converge**: Repeat until the defined number of iterations (trees) is reached.

## Evaluation
We evaluate models based on their ability to minimize RMSE on a hold-out validation set.

### Trade-off Analysis
*   **Model A (Conservative)**: High bias towards over-estimation. Safer for customer satisfaction, bad for conversion.
*   **Model B (Aggressive)**: High bias towards under-estimation. Good for conversion, bad for retention.
*   **Decision**: Use A/B testing to balance these trade-offs in production.
