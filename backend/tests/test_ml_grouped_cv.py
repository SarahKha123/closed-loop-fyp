"""Grouped CV (ml.evaluate --grouped): no condition block may sit on both sides of a split."""

import numpy as np

from ml import features, labels
from ml.pipeline import N_REPEATS, N_SPLITS, grouped_splits


def test_condition_blocks_and_grouped_splits_keep_blocks_whole():
    blocks = labels.condition_blocks()
    assert blocks.nunique() == 194  # the rig's runs of one condition combination
    X, y = features.load_features(), labels.load_labels()["valve"].to_numpy()
    splits = grouped_splits(X, y, blocks)
    assert len(splits) == N_SPLITS * N_REPEATS
    g = blocks.to_numpy()
    for train, test in splits:
        assert not set(g[train]) & set(g[test])
        assert set(np.unique(y[test])) == {0, 1, 2}  # stratified: every class is scored in every fold
