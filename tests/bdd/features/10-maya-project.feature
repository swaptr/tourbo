@story-10
Feature: Maya keeps notes and to-dos on her tour
  Scenario: Notes and to-dos on the tour save, tick, delete and come back
    Given a finished plan for a "musician"
    When I open the "Notes" tab
    And I add the to-do "Send tech rider" to the tour
    And I add the note "Ask about the piano" to the tour
    And I add the note "Throwaway" to the tour
    And I tick "Send tech rider" done
    And I delete "Throwaway" from the tour notes
    And I reload the page
    Then the tour notes show "Send tech rider" ticked and "Ask about the piano"
    And the tour notes don't show "Throwaway"

  Scenario: Her own AI assistant keeps the same kind of notebook and gets it back as markdown
    Given an AI assistant connected to Tourbo
    When it makes a project "Spring tour 2027" for "Maya"
    And it adds the to-do "Send tech rider" for "Chicago"
    And it adds the setlist idea "Open with the slow one"
    And it ticks the to-do done
    And it adds and then deletes a throwaway note
    Then the project has 2 items
    And its markdown shows the to-do ticked for "Chicago"

  Scenario: A bad project id gets a plain hint
    Given an AI assistant connected to Tourbo
    When it opens the project "nope"
    Then it is told the project wasn't found

  Scenario: An old project link lands on the workspace
    Given an AI assistant connected to Tourbo
    When it makes a project "Spring tour 2027" for "Maya"
    Then that project's old web link moves for good to the workspace
