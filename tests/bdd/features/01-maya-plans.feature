@story-1
Feature: Maya plans a short run that makes money
  Maya is an indie singer in Chicago with a draw of about 300.
  She wants five shows within a day's drive that make money.

  Scenario: A listed singer plans five nights around Chicago
    Given I start a new plan
    When I pick the kind "musician"
    And I type my name "Test Act 3"
    Then Tourbo finds me
    When I continue
    And I start near "Chicago" within 600 km
    And I continue
    And I set the first show to "2027-03-01" and play 5 shows
    And I continue
    And I start planning
    Then my plan page opens
    And the plan has at least 2 nights with a money verdict
    And every city in the plan is inside my circle
    And no losing night is shown as the best bet
    And I see the tour total
