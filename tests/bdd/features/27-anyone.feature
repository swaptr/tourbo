@story-27
Feature: Anyone, not on the list, still gets ideas
  Scenario Outline: A <kind> planned from <basis> gets ideas and is told what they're based on
    Given a finished plan for an unlisted "<kind>" planned from "<basis>"
    When I open the "Ideas" tab
    Then I see idea tiles of the right kinds for a "<kind>"
    And the ideas say in one line what they are based on

    Examples:
      | kind      | basis        |
      | comedian  | Just my city |
      | musician  | My style is… |
      | poet      | Just my city |
