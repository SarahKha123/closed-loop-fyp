# Table (a): Prior results on the UCI hydraulic dataset (verified)

Every number below was read from the paper's own table, and every DOI was checked in Crossref (8 Nov 2026).

## Main comparison (per-component, same dataset)

| Study | Model | Validation | Metric | Cooler | Valve | Pump | Accumulator | From |
|---|---|---|---|---:|---:|---:|---:|---|
| Helwig et al. (2015) | LDA | as reported by Tao et al. | Accuracy % | 100.00 | 100.00 | 98.00 | 90.40 | Tao et al. (2024) Table 8 |
| Liu (in Tao et al.) | LDA + HKELM | as reported by Tao et al. | Accuracy % | 99.94 | 99.98 | 99.91 | 98.31 | Tao et al. (2024) Table 8 |
| Wang et al. (in Tao et al.) | PCC + NCA + deep learning | as reported by Tao et al. | Accuracy % | 99.91 | 100.00 | 99.77 | 98.70 | Tao et al. (2024) Table 8 |
| Zhang et al. (in Tao et al.) | Deep transfer learning | as reported by Tao et al. | Accuracy % | 100.00 | 100.00 | 98.20 | 96.40 | Tao et al. (2024) Table 8 |
| Huang et al. (in Tao et al.) | Multi-rate CNN | as reported by Tao et al. | Accuracy % | 100.00 | 100.00 | 98.98 | 99.35 | Tao et al. (2024) Table 8 |
| Tao et al. (2024) | MS-CNN (1D CNN + RF sensor selection) | 5-fold CV | Accuracy % | 100.00 | 100.00 | 99.94 | 99.96 | Tao et al. (2024) Table 8 |
| Song et al. (2023) | RFRFE + XGBoost (13 features) | single train/test split, 221 test samples | Macro-F1 | 1.0000 | 0.9318 | 0.9816 | 0.9672 | Song et al. (2023) Table 2 |
| Enejor et al. (2026) | Random Forest, **random** 4-fold CV | random split | Accuracy | 0.999 | 0.991 | 0.996 | 0.991 | Enejor et al. (2026) Table 3 |
| Enejor et al. (2026) | Random Forest, **block-aware** 4-fold CV | grouped by condition block | Accuracy | 0.954 | 0.869 | 0.996 | 0.804 | Enejor et al. (2026) Table 3 |
| **This project** | RF / XGBoost (68 features) | repeated stratified 5-fold × 3 (random) | Macro-F1 | 0.999 | 0.984 | 0.995 | 0.990 | Chapter 4 |

Notes:
- The Tao et al. rows for other authors are secondary citations: write "as reported in Tao et al. (2024)".
- Tao et al. Table 8 (Case II) uses the dataset of Helwig et al. [40]; the paper does not say "UCI" by name.
- Song et al. label it "XGBoost parameter information", but it is the per-class precision/recall/F1 report.

## Key finding for Chapter 4: random vs block-aware validation

Enejor et al. (2026), Table 3: the dataset is stored as 194 contiguous condition blocks (mean ~11.4 cycles),
so random k-fold puts near-identical neighbouring cycles in both train and test. Random-split vs block-aware gap:
valve up to 26.8 points (MLP), 12.2 (RF); accumulator 18.7 (RF); cooler 4.5 (RF); pump 0.0 (RF).
This project's random-CV scores match their random-split RF almost exactly, so the same inflation likely applies.
Support the leakage point with the peer-reviewed sources Kapoor & Narayanan (2023) and Roberts et al. (2017);
Enejor et al. is from Science Publishing Group, a publisher with a weak reputation, so do not lean on it alone.

## Not suitable for the table

- Kim & Heo (2022): binary anomaly detection per component (normal vs not), with RF test accuracy cooler 0.884,
  valve 0.959, pump 0.961, accumulator 0.959 (Boruta/Pearson features, Tables 6-12). A different task, so cite in
  the text only.
- Mallak & Fathi (2021): fault-type results are aggregated across all four faults (best RF + feature importance
  0.9930, Table 6), with no per-component numbers. Cite for the LSTM-autoencoder detection approach only.
- Schneider, Helwig & Schütze (2018), Meas. Sci. Technol. 29(9) 094002: real and relevant (automated feature
  extraction on this dataset), but the full text could not be accessed to extract numbers.

## References (APA 7, Crossref-verified)

Enejor, E., Ibigbami, N., Lawal, I., Adeoti, T., Adesoye, A., & Ajibesin, S. (2026). An uncertainty-calibrated ensemble framework for fault diagnosis in industrial hydraulic power units: Rethinking stacked neural architectures. *Automation, Control and Intelligent Systems, 14*(3), 59–72. https://doi.org/10.11648/j.acis.20261403.12

Kapoor, S., & Narayanan, A. (2023). Leakage and the reproducibility crisis in machine-learning-based science. *Patterns, 4*(9), 100804. https://doi.org/10.1016/j.patter.2023.100804

Kim, D., & Heo, T.-Y. (2022). Anomaly detection with feature extraction based on machine learning using hydraulic system IoT sensor data. *Sensors, 22*(7), 2479. https://doi.org/10.3390/s22072479

Mallak, A., & Fathi, M. (2021). Sensor and component fault detection and diagnosis for hydraulic machinery integrating LSTM autoencoder detector and diagnostic classifiers. *Sensors, 21*(2), 433. https://doi.org/10.3390/s21020433

Roberts, D. R., Bahn, V., Ciuti, S., Boyce, M. S., Elith, J., Guillera-Arroita, G., Hauenstein, S., Lahoz-Monfort, J. J., Schröder, B., Thuiller, W., Warton, D. I., Wintle, B. A., Hartig, F., & Dormann, C. F. (2017). Cross-validation strategies for data with temporal, spatial, hierarchical, or phylogenetic structure. *Ecography, 40*(8), 913–929. https://doi.org/10.1111/ecog.02881

Schneider, T., Helwig, N., & Schütze, A. (2018). Industrial condition monitoring with smart sensors using automated feature extraction and selection. *Measurement Science and Technology, 29*(9), 094002. https://doi.org/10.1088/1361-6501/aad1d4

Song, Z., Wang, J., Wang, M., Yang, B., Cui, L., Zhang, Q., Xiang, G., & Lin, R. (2023). Hydraulic systems fault diagnosis based on random forests recursive feature elimination and XGBoost. *Journal of Physics: Conference Series, 2569*(1), 012056. https://doi.org/10.1088/1742-6596/2569/1/012056

Tao, H., Jia, P., Wang, X., & Wang, L. (2024). Real-time fault diagnosis for hydraulic system based on multi-sensor convolutional neural network. *Sensors, 24*(2), 353. https://doi.org/10.3390/s24020353
