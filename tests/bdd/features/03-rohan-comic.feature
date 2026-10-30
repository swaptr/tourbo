@story-3
Feature: Rohan, a stand-up comic in Mumbai, plans comedy rooms
  Scenario: A comic gets comedy rooms, rupee prices and local hooks
    Given I start a new plan
    When I pick the kind "comedian"
    And I type my name "Test Person 5"
    Then Tourbo finds me
    When I continue
    And I start near "Mumbai" within 300 km
    And I continue
    And I set the first show to "2027-03-01" and play 2 shows
    And I continue
    And I start planning
    Then my plan page opens
    And the plan has at least 2 nights with a money verdict
    And every room in the plan is a kind of space a "comedian" plays
    And prices are shown in "₹"
    When I open the "Ideas" tab
    Then I see idea tiles of the right kinds for a "comedian"
