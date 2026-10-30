@story-13
Feature: Does Tourbo pick what bookers picked?
  # Pending: the backtest measures real 2024–25 tours against live fan data; on synthetic data
  # the comparison means nothing. Run tests/stories/13-backtest.test.ts with quota.
  @pending
  Scenario: Fan-data picks beat chance on real tours
    Given the eight recorded tours
    When Tourbo ranks cities by fan score
    Then the fan-data column stays at or above the recorded mean
