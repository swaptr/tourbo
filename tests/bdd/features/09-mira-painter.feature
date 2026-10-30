@story-9
Feature: Mira, a painter, plans a gallery run from her own assistant
  Scenario: Painters are a listed discipline
    Given an AI assistant connected to Tourbo
    When it lists the kinds of act Tourbo plans for
    Then the list has all 18 kinds, including "visual_artist"

  Scenario: A painter's run uses galleries, stays about two weeks and counts sales per visitor
    Given an AI assistant connected to Tourbo
    When it plans 3 shows for "Test Person 8" as a "visual_artist" near "London" in "eu"
    Then every space is a kind of space a "visual_artist" shows in
    And the stops are at least 10 days apart
    And the money counts visitors, not just tickets
