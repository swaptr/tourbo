@story-4
Feature: Ana, a new act not in the fan data, plans from acts she sounds like
  Scenario: Two acts she sounds like become the plan's basis, and the plan says so
    Given I start a new plan
    When I pick the kind "musician"
    And I type my name "Nobody Ana"
    Then Tourbo says my name isn't listed yet
    When I plan from "I sound like…"
    And I add "Test Act 1" as an act I sound like
    And I add "Test Act 2" as an act I sound like
    And I continue
    And I start near "Chicago" within 600 km
    And I continue
    And I set the first show to "2027-03-01" and play 3 shows
    And I continue
    And I start planning
    Then my plan page opens
    And the plan has at least 2 nights with a money verdict
    And the plan says it was planned from fans of "Test Act 1" and "Test Act 2"

  Scenario: A name that matches nobody is refused with a hint, never dropped silently
    Given I start a new plan
    When I pick the kind "musician"
    And I type my name "Nobody Ana"
    And I plan from "I sound like…"
    And I try to add "Nobody At All" as an act I sound like
    Then I see a hint that there is no match for "Nobody At All"
