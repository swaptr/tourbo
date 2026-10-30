@story-6
Feature: Lee, a small-bar booker, finds acts for empty nights
  Scenario: Acts his room's crowd likes, with local fans
    Given an AI assistant connected to Tourbo
    When it asks which acts suit the venue "Test Venue 1" in "Chicago"
    Then it gets at least 5 acts
    And some of them have local fans
