@story-26
Feature: Mira gets painting subjects for each city
  Scenario: At least 5 subjects per city, labelled as taste-based ideas
    Given a finished plan for a "visual_artist"
    When I open the "Ideas" tab
    And I ask for lots of local flavour
    Then every city has at least 5 ideas across at least 2 categories
    And the ideas are labelled as taste-based, not sales predictions
    And at least two cities get different ideas
