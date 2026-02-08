# Inference

Inference is the process of using a trained machine learning model to make predictions. This module covers techniques to scale inference in production environments.

## Contents

1.  [Load Balancing & Aggregator Pattern](#load-balancing)
2.  [Serving Multiple Models](#serving-logic)
3.  [Non-Stationary Problems](#non-stationary)
4.  [Exploration vs. Exploitation](#thompson-sampling)

## Scalable Inference Techniques

### Load Balancing
During inference, workloads are often split across multiple inference servers using an **Aggregator Service** (or Dispatcher).
*   **Clients** send requests to the Aggregator.
*   **Aggregator** distributes work to a **Worker Pool**.
*   **Strategies**: Round Robin, Least Connections, Consistent Hashing.

### Serving Logic
In complex systems (e.g., Ad Prediction), different models may be used for different traffic segments. The inference service must route requests to the appropriate model based on request parameters.

### Non-Stationary Problems
Data distributions change over time (drift).
*   **Retraining**: frequent updates.
*   **Online Learning**: Algorithms like Bayesian Logistic Regression can update weights incrementally.

### Thompson Sampling
Used for Exploration vs. Exploitation (e.g., Ad Click Prediction).
Instead of always picking the "best" ad (Exploitation), we sample from the posterior distribution of the click probability (Exploration).
$$
\text{action} = \arg\max_a \theta_a \quad \text{where} \quad \theta_a \sim \text{Beta}(\alpha_a, \beta_a)
$$
*   $\alpha_a$: successes + 1
*   $\beta_a$: failures + 1
