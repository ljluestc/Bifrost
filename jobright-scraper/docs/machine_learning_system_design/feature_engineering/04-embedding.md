# Embedding

**Embeddings** are a technique to learn a dense, lower-dimensional vector representation of a categorical feature (or other high-dimensional data).

## Concept
Unlike One Hot Encoding (sparse) or Hashing (fixed-random), embeddings are **learned** parameters.
*   We map each category to a vector of size $d$ (e.g., 64, 128).
*   The values in the vector are adjusted during training (via backpropagation) to minimize the loss function.
*   Semantically similar items end up close to each other in the vector space.

## Comparison
| Feature | One Hot Encoding | Feature Hashing | Embedding |
| :--- | :--- | :--- | :--- |
| **Dimension** | High (Vocabulary Size) | Medium (Hash Size) | Low (Hyperparameter $d$) |
| **Sparsity** | Very Sparse | Sparse/Dense | Dense |
| **Learnable?** | No | No | Yes |
| **Semantic?** | No | No | Yes |

## Technique
Embeddings are typically implemented as a lookup table (matrix extraction) which acts like the first layer of a neural network.
Example: `tf.keras.layers.Embedding(input_dim=vocab_size, output_dim=embedding_dim)`

## Usage in Tech Companies
*   **Twitter/X**: User Embeddings (capturing interests based on follow graph).
*   **DoorDash**: Store Embeddings (representing cuisine, price range, location similarly).
*   **Instagram**: Account/Post Embeddings for ranking feeds.
