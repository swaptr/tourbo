@story-7
Feature: When things go wrong, Tourbo says so plainly
  Every failure gets one plain sentence saying what happened and what to do next, plus a retry
  where it makes sense. Never a stack trace or a blank page.

  Scenario: The act isn't found: never a dead end
    Given I start a new plan
    When I pick the kind "comedian"
    And I type my name "Unlisted Local Comic"
    Then Tourbo says my name isn't listed yet
    And I can choose "I sound like…", "My style is…" or "Just my city"

  Scenario: Fan data is rate-limited while Tourbo looks me up
    Given I start a new plan
    And the fan data is rate-limited
    When I pick the kind "musician"
    And I type my name "Test Act 4"
    Then I see a plain message that says what to do next

  Scenario: Fan data is rate-limited on the Ideas tab, then comes back
    Given a finished plan for a "comedian"
    And the fan data is rate-limited
    When I open the "Ideas" tab
    Then I see a plain message that says what to do next
    And I can retry
    When the fan data is back
    And I retry
    Then I see idea tiles of the right kinds for a "comedian"

  @no-ai
  Scenario: The AI key is missing: the planner says so and offers a retry
    Given I start a new plan
    When I pick the kind "musician"
    And I type my name "Test Act 3"
    Then Tourbo finds me
    When I continue
    And I start near "Chicago" within 600 km
    And I continue
    And I set the first show to "2027-03-01" and play 4 shows
    And I continue
    And I start planning
    Then my plan page opens
    And the planner says plainly that it couldn't finish, with a retry

  @no-ai
  Scenario: The AI key is missing: writing angles on ideas says so plainly
    Given a finished plan for a "musician"
    When I open the "Ideas" tab
    Then I see idea tiles of the right kinds for a "musician"
    When I ask Tourbo to write my angles
    Then I see "Your AI assistant isn't set up on this server"
    And I still see the plain ideas

  Scenario: A run dies mid-way: the plan page says so and offers a retry
    Given a plan that was cut off by a server restart
    When I open my plan
    Then I see "The planner was interrupted."
    And I see a "Retry" button

  # Pending: stopping the suite's database mid-run would break the scenarios after it; the
  # "database down" sentence is covered by tests/stories/7-errors.test.ts.
  @pending
  Scenario: The database is down
    Given the database is down
    When I start planning
    Then I see a plain message that says what to do next
