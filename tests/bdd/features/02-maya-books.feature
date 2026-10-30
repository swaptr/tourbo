@story-2
Feature: Maya preps a night and books it
  On a night's card Maya opens Show prep, then a venue lowballs her and Tourbo answers.

  Scenario: A $300 flat fee is not accepted, and any counter respects her lowest fee
    Given Maya expects about 420 people in a 450-person room at 22 a ticket with 1800 in costs
    When the venue offers a flat fee of 300
    Then Tourbo does not accept the offer
    And any counter-offer asks for at least 800, her lowest fee

  Scenario: A fair offer is accepted
    Given Maya expects about 420 people in a 450-person room at 22 a ticket with 1800 in costs
    When the venue offers 4500 against 80% of the door
    Then Tourbo accepts the offer

  @no-ai
  Scenario: Without the AI assistant, show notes say so plainly
    Given a finished plan for a "musician"
    When I open the "Notes" tab
    And I ask Tourbo to write show notes
    Then I see a plain message that says what to do next

  @llm
  Scenario: With the AI assistant, every show-notes line is tied to a fan-data fact
    Given a finished plan for a "musician"
    When I open the "Notes" tab
    And I ask Tourbo to write show notes
    Then the show notes appear with an opening line
