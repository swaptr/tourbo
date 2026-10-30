@story-15
Feature: Every screen looks like one calm product
  Scenario Outline: <page> renders without console errors
    When I open "<path>"
    Then there are no console errors

    Examples:
      | page    | path     |
      | home    | /        |
      | wizard  | /start   |
      | connect | /connect |
      | help    | /help    |

  Scenario: Hint popovers stay inside the screen on a phone (wizard)
    Given I am on a 390 px wide screen
    When I open "/start"
    And I pick the kind "musician"
    Then every hint popover stays inside the screen

  Scenario: Hint popovers stay inside the screen on a phone (plan page)
    Given I am on a 390 px wide screen
    And a finished plan for a "musician"
    Then every hint popover stays inside the screen
    And there are no console errors
