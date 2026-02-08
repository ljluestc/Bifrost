#include <iostream>
#include <vector>
#include <random>
#include <algorithm>
#include <iomanip>

// Thompson Sampling for Multi-Armed Bandit
// Each "arm" represents an Ad candidate.

class ThompsonSampler {
public:
    ThompsonSampler(int num_arms) : 
        num_arms(num_arms), 
        alpha(num_arms, 1.0), // Alpha = success + 1
        beta(num_arms, 1.0),  // Beta = failures + 1
        gen(std::random_device{}()) {}

    // Select the arm with the highest sample from Beta distribution
    int select_arm() {
        int best_arm = -1;
        double max_sample = -1.0;

        for (int i = 0; i < num_arms; ++i) {
            std::beta_distribution<double> d(alpha[i], beta[i]);
            double sample = d(gen);
            
            if (sample > max_sample) {
                max_sample = sample;
                best_arm = i;
            }
        }
        return best_arm;
    }

    // Update the distribution based on reward (1 = click, 0 = no click)
    void update(int arm, int reward) {
        if (reward == 1) {
            alpha[arm] += 1;
        } else {
            beta[arm] += 1;
        }
    }

    void print_stats() {
        std::cout << "\nCurrent Beta Distributions:" << std::endl;
        for (int i = 0; i < num_arms; ++i) {
            std::cout << "Ad " << i << ": Alpha=" << alpha[i] << ", Beta=" << beta[i] 
                      << " -> Mean Prob: " << std::fixed << std::setprecision(4) 
                      << alpha[i] / (alpha[i] + beta[i]) << std::endl;
        }
    }

private:
    int num_arms;
    std::vector<double> alpha;
    std::vector<double> beta;
    std::mt19937 gen;
};

int main() {
    int num_ads = 5;
    ThompsonSampler ts(num_ads);
    
    // Hidden "True" CTRs for simulation
    std::vector<double> true_ctrs = {0.05, 0.02, 0.08, 0.03, 0.01}; 
    std::mt19937 rng(std::random_device{}());

    std::cout << "Simulating 1000 Impressions..." << std::endl;

    for (int t = 0; t < 1000; ++t) {
        // 1. Select Ad
        int chosen_ad = ts.select_arm();

        // 2. Simulate User Response (Bernoulli trial based on true CTR)
        std::bernoulli_distribution d(true_ctrs[chosen_ad]);
        int reward = d(rng) ? 1 : 0;

        // 3. Update Model
        ts.update(chosen_ad, reward);
    }

    ts.print_stats();
    std::cout << "\nTrue CTRs (Hidden):" << std::endl;
    for(int i=0; i<num_ads; ++i) std::cout << "Ad " << i << ": " << true_ctrs[i] << std::endl;

    return 0;
}
