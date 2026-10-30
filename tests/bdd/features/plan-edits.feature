@edits
Feature: Your plan, your call
  After Tourbo plans, the act changes nights, tunes the money and keeps what's already written.

  Scenario: I swap a night and the totals update, other nights untouched
    Given a finished plan for a "musician"
    When I change night 2 to another city Tourbo checked and confirm
    Then night 2 is in the new city
    And the tour total changes to match the new night
    And the other nights stay as they were
    When I undo the change
    Then the plan is back to Tourbo's plan

  Scenario: I tune a lever, see the change inline, and undo it
    Given a finished plan for a "musician"
    When I open "Tune" and set "Risk" to "Bold"
    Then I see what it does to the plan inline
    When I undo the lever
    Then the plan is back to Tourbo's numbers

  @llm
  Scenario: I ask Tourbo to make it cheaper and apply its proposal
    Given a finished plan for a "musician"
    When I ask Tourbo "Make it cheaper"
    Then I see a proposal card with what changes
    When I apply it
    Then the proposal is applied to my plan
    And a share-link visitor can't apply proposals

  Scenario: Saved ideas are not fetched again when I come back
    Given a finished plan for a "comedian"
    When I open the "Ideas" tab
    Then I see idea tiles of the right kinds for a "comedian"
    When I come back to the Ideas tab later
    Then the same ideas show without asking the fan data again

  Scenario: More local flavour shows more local ideas
    Given a finished plan for a "comedian"
    When I open the "Ideas" tab
    And I note how many ideas each city shows
    And I ask for lots of local flavour
    Then every city shows at least as many ideas as before, and one shows more
