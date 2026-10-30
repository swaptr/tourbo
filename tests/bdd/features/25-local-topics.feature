@story-25
Feature: Rohan gets local topics for each city
  Scenario: At least 8 topics across 4 categories per city, differing by city
    Given a finished plan for a "comedian"
    When I open the "Ideas" tab
    And I ask for lots of local flavour
    And I show the rest of the ideas
    Then every city has at least 8 ideas across at least 4 categories
    And every idea has a "why?"
    And at least two cities get different ideas
