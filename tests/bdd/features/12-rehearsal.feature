@story-12
Feature: Maya rehearses a night with simulated fans
  Scenario: The panel is built from that city's data, differs by city and is labelled a rehearsal
    Given an AI assistant connected to Tourbo
    When it builds the rehearsal panel for "Test Act 3" in "Chicago" and in "Detroit"
    Then each panel has at least 3 fans, each built from at least 2 facts
    And each panel is labelled a rehearsal
    And the born-and-raised local differs between the two cities

  @llm
  Scenario: Rehearse with fans on the show-notes page
    Given a finished plan for a "musician"
    When I open the "Notes" tab
    And I ask Tourbo to write show notes
    And I press "Rehearse with fans"
    Then I see "rehearsal"
