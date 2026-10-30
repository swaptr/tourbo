@workspace
Feature: Profile once, then a workspace of tours and shows
  Maya says who she is once. After that every tour or show starts from her profile, and her
  workspace lists what she's planned, files past tours away by itself, and remembers her filters.

  Scenario: I set up my profile once
    Given I am new to Tourbo
    When I open "/work"
    Then I am asked who I am
    When I pick the kind "musician"
    And I type my name "Nobody Q21"
    And Tourbo says my name isn't listed yet
    And I plan from "Just my city"
    And I continue
    And I pick "Chicago" as my home base and save
    Then I land on my work
    When I plan a tour from my work
    Then the tour form opens without asking who I am

  Scenario: I skip setup, then start a tour
    Given I am new to Tourbo
    When I open "/start"
    And I press "Skip for now"
    Then I land on my work
    And I see "Finish your profile"
    When I plan a tour from my work
    Then I am asked only for my name and home base, with why
    When I type my name "Nobody Q21"
    And Tourbo says my name isn't listed yet
    And I plan from "Just my city"
    And I continue
    And I pick "Chicago" as my home base and save
    Then the tour form opens without asking who I am

  Scenario: A comedian who also sings plans a singing tour
    Given my profile says I do "comedian" first and "musician" too
    When I plan a tour from my work
    Then the tour form offers "comedian", "musician" and "Something else", "comedian" picked
    When I pick "musician" for this tour
    Then this tour is a "musician" tour

  Scenario: I add a 3-day show at my own venue
    Given my profile says I do "musician" first
    When I open "/new?type=event"
    And I add a show in "Chicago" from "2027-05-01" to "2027-05-03" at my own venue "The Hideout"
    Then the show page says "1 May – 3 May 2027" and "The Hideout"
    And it is listed under Shows

  Scenario: I archive a past tour
    Given my profile says I do "musician" first
    And I have a tour that ended last year and one coming up
    When I open "/work"
    Then only the upcoming tour is listed
    When I show archived work
    Then the past tour is listed
    When I restore the past tour
    And I show active work
    Then both tours are listed

  Scenario: I filter my tours
    Given my profile says I do "musician" first
    And I have a tour that ended last year and one coming up
    When I open "/work"
    And I search my work for "upcoming"
    Then the address keeps "q=upcoming"
    When I reload the page
    Then the search still says "upcoming"
    And only the upcoming tour is listed
