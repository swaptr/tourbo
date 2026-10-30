@story-24
Feature: Maya gets cover ideas for each city
  Scenario: Two or three covers per city, each with a why, differing by city
    Given a finished plan for a "musician"
    When I open the "Ideas" tab
    And I ask for lots of local flavour
    Then the Ideas tab leaves covers to the Covers tab
    When I open the Covers tab
    Then every night has between 2 and 3 covers, each with a "why?"
    And at least two nights get different covers
