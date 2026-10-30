@story-17
Feature: Tourbo speaks as Tourbo
  Scenario Outline: <page> never names the fan-data or AI vendor
    When I open "<path>"
    Then the page never names the data or AI vendor

    Examples:
      | page     | path      |
      | home     | /         |
      | wizard   | /start    |
      | help     | /help     |
      | projects | /projects |

  Scenario: A plan and its tabs never name the vendors
    Given a finished plan for a "musician"
    Then the page never names the data or AI vendor
    When I open the "Ideas" tab
    Then I see idea tiles of the right kinds for a "musician"
    And the page never names the data or AI vendor
    When I open the "Notes" tab
    Then the page never names the data or AI vendor
    When I open the "Your set" tab
    Then the page never names the data or AI vendor

  Scenario: The setup page names them and lists at least four assistants
    When I open "/connect"
    Then the page names the data and AI vendors
    And it lists at least 4 AI assistants
