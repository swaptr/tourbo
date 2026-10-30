@a11y
Feature: Every main screen meets WCAG 2.2 AA
  Maya plans on a laptop and checks the night on her phone, sometimes with a keyboard only, a
  screen reader or high zoom. Every main screen passes an automated WCAG 2.2 A/AA check (axe-core)
  in the light and dark theme, on a laptop and a phone. {tour} and {event} are a seeded tour and
  show owned by this browser; /start opens as a newcomer (no profile yet).

  Scenario Outline: <page> passes the accessibility check in <theme> at <width> px
    Given a musician with a tour and a show
    And I use the <theme> theme on a <width> px wide screen
    When I open the accessible page "<path>"
    Then the accessibility check finds no WCAG 2.2 A or AA problems

    Examples:
      | page              | path                     | theme | width |
      | Home              | /                        | light | 1440  |
      | Home              | /                        | dark  | 1440  |
      | Home              | /                        | light | 390   |
      | Home              | /                        | dark  | 390   |
      | Setup             | /start                   | light | 1440  |
      | Setup             | /start                   | dark  | 1440  |
      | Setup             | /start                   | light | 390   |
      | Setup             | /start                   | dark  | 390   |
      | Work              | /work                    | light | 1440  |
      | Work              | /work                    | dark  | 1440  |
      | Work              | /work                    | light | 390   |
      | Work              | /work                    | dark  | 390   |
      | Shows             | /work?show=events        | light | 1440  |
      | Shows             | /work?show=events        | dark  | 1440  |
      | Shows             | /work?show=events        | light | 390   |
      | Shows             | /work?show=events        | dark  | 390   |
      | Material          | /material                | light | 1440  |
      | Material          | /material                | dark  | 1440  |
      | Material          | /material                | light | 390   |
      | Material          | /material                | dark  | 390   |
      | Help              | /help                    | light | 1440  |
      | Help              | /help                    | dark  | 1440  |
      | Help              | /help                    | light | 390   |
      | Help              | /help                    | dark  | 390   |
      | Connect           | /connect                 | light | 1440  |
      | Connect           | /connect                 | dark  | 1440  |
      | Connect           | /connect                 | light | 390   |
      | Connect           | /connect                 | dark  | 390   |
      | Ideas             | /ideas                   | light | 1440  |
      | Ideas             | /ideas                   | dark  | 1440  |
      | Ideas             | /ideas                   | light | 390   |
      | Ideas             | /ideas                   | dark  | 390   |
      | Tour plan         | /plan/{tour}             | light | 1440  |
      | Tour plan         | /plan/{tour}             | dark  | 1440  |
      | Tour plan         | /plan/{tour}             | light | 390   |
      | Tour plan         | /plan/{tour}             | dark  | 390   |
      | Tour night panel  | /plan/{tour}?night=2     | light | 1440  |
      | Tour night panel  | /plan/{tour}?night=2     | dark  | 390   |
      | Tour ideas        | /plan/{tour}/ideas       | light | 1440  |
      | Tour ideas        | /plan/{tour}/ideas       | dark  | 1440  |
      | Tour ideas        | /plan/{tour}/ideas       | light | 390   |
      | Tour ideas        | /plan/{tour}/ideas       | dark  | 390   |
      | Tour covers       | /plan/{tour}/covers      | light | 1440  |
      | Tour covers       | /plan/{tour}/covers      | dark  | 390   |
      | Tour set          | /plan/{tour}/set         | light | 1440  |
      | Tour set          | /plan/{tour}/set         | dark  | 1440  |
      | Tour set          | /plan/{tour}/set         | light | 390   |
      | Tour set          | /plan/{tour}/set         | dark  | 390   |
      | Tour notes        | /plan/{tour}/prep        | light | 1440  |
      | Tour notes        | /plan/{tour}/prep        | dark  | 390   |
      | Tour booking      | /plan/{tour}/pipeline    | light | 1440  |
      | Tour booking      | /plan/{tour}/pipeline    | dark  | 1440  |
      | Tour booking      | /plan/{tour}/pipeline    | light | 390   |
      | Tour booking      | /plan/{tour}/pipeline    | dark  | 390   |
      | Tour numbers      | /plan/{tour}/insights    | light | 1440  |
      | Tour numbers      | /plan/{tour}/insights    | dark  | 390   |
      | Tour tickets      | /plan/{tour}/live        | light | 1440  |
      | Tour tickets      | /plan/{tour}/live        | dark  | 390   |
      | Tour compare      | /plan/{tour}/compare     | light | 1440  |
      | Tour compare      | /plan/{tour}/compare     | dark  | 390   |
      | Tour openers      | /plan/{tour}/openers     | light | 1440  |
      | Tour openers      | /plan/{tour}/openers     | dark  | 390   |
      | Tonight           | /plan/{tour}/tonight     | light | 1440  |
      | Tonight           | /plan/{tour}/tonight     | dark  | 1440  |
      | Tonight           | /plan/{tour}/tonight     | light | 390   |
      | Tonight           | /plan/{tour}/tonight     | dark  | 390   |
      | Show              | /events/{event}          | light | 1440  |
      | Show              | /events/{event}          | dark  | 1440  |
      | Show              | /events/{event}          | light | 390   |
      | Show              | /events/{event}          | dark  | 390   |

  Scenario Outline: <page> reflows at 320 px without sideways scrolling
    Given a musician with a tour and a show
    And I use the light theme on a 320 px wide screen
    When I open the accessible page "<path>"
    Then the page reflows without sideways scrolling

    Examples:
      | page        | path                  |
      | Home        | /                     |
      | Setup       | /start                |
      | Work        | /work                 |
      | Material    | /material             |
      | Help        | /help                 |
      | Connect     | /connect              |
      | Ideas       | /ideas                |
      | Tour plan   | /plan/{tour}          |
      | Tour set    | /plan/{tour}/set      |
      | Tour booking| /plan/{tour}/pipeline |
      | Tonight     | /plan/{tour}/tonight  |
      | Show        | /events/{event}       |
