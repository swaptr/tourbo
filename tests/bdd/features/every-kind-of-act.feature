@hobbies
Feature: Every kind of act can plan a run and get ideas for each place
  As a working artist of any kind, not listed in the fan data,
  I want to plan a few nights around my city and get ideas for each one,
  so that I know where to go, whether it pays, and what to make or perform there.

  Background:
    Given I start a new plan

  Scenario Outline: A <kind> who isn't listed plans from "<way>" and gets ideas for every city
    When I pick the kind "<kind>"
    And I type my name "Unlisted <kind>"
    Then Tourbo says my name isn't listed yet
    When I plan from "<way>"
    And I continue
    And I start near "Chicago" within 600 km
    And I continue
    And I set the first show to "2027-03-01" and play 4 shows
    And I continue
    And I start planning
    Then my plan page opens
    And the plan has at least 2 nights with a money verdict
    And the plan says in one line what it was built from
    When I open the "Ideas" tab
    Then I see idea tiles of the right kinds for a "<kind>"
    When I build my set from 6 of my own pieces, if my kind has a set
    Then each city gets a running order that stays within the originality budget, if my kind has a set
    When I go to the home page
    Then my work lists the plan
    When I delete the plan from my work
    Then the plan is gone for good

    Examples:
      | kind          | way           |
      | musician      | My style is…  |
      | comedian      | Just my city  |
      | dj            | My style is…  |
      | dancer        | Just my city  |
      | poet          | My style is…  |
      | visual_artist | Just my city  |
      | author        | My style is…  |
      | podcaster     | Just my city  |
      | speaker       | My style is…  |
      | magician      | Just my city  |
      | theatre       | My style is…  |
      | photographer  | Just my city  |
      | maker         | My style is…  |
      | busker        | Just my city  |
      | circus        | My style is…  |
      | chef          | Just my city  |
      | filmmaker     | My style is…  |
      | teacher       | Just my city  |

  Scenario Outline: A <kind> sees the tour's insights as charts
    Given a finished plan for a "<kind>"
    When I open the "Numbers" tab
    Then I see charts, each with a plain question as its title and a one-line takeaway

    Examples:
      | kind          |
      | musician      |
      | comedian      |
      | dj            |
      | dancer        |
      | poet          |
      | visual_artist |
      | author        |
      | podcaster     |
      | speaker       |
      | magician      |
      | theatre       |
      | photographer  |
      | maker         |
      | busker        |
      | circus        |
      | chef          |
      | filmmaker     |
      | teacher       |
