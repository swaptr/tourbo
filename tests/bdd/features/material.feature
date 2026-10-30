@material
Feature: Material is the act's own library, reused across events
  Maya keeps her songs in one place and builds each event's set from them.
  Deleting an event never deletes her songs.

  Scenario: I build a set from my material
    Given I open "/material"
    Then I see "Your library is a blank page"
    When I add these songs to my material:
      | title          | length |
      | Harbour Lights | 4      |
      | Paper Moon     | 3:30   |
      | Slow Train     | 5      |
      | Glass House    | 4      |
      | Northbound     | 6      |
    Then my material lists 5 songs
    When I try to add a song without a title
    Then I see "Give it a title."
    Given I have two events "Friday at the Hideout" and "Sunday matinee"
    When I build the set for "Friday at the Hideout" from all 5 songs
    And I reuse "Slow Train", "Harbour Lights" and "Northbound" for "Sunday matinee"
    Then the set for "Sunday matinee" is "Slow Train", "Harbour Lights", "Northbound"
    When I delete the event "Friday at the Hideout"
    Then my material lists 5 songs
    And the set for "Sunday matinee" is "Slow Train", "Harbour Lights", "Northbound"
