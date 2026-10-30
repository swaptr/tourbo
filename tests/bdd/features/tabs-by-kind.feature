@hobbies @tabs-by-kind
Feature: Each kind of act gets the tabs that fit its work
  A comic needs crowd questions, a painter a hang and sales, a teacher seats per session, a busker
  pitches and no tickets. The tour shows only the tabs that make sense for the act, named the way
  that act talks, and a tab that's only for some kinds opens only when there's something in it.

  Scenario Outline: A <kind>'s tour shows the tabs that fit the act
    Given a finished plan for a "<kind>"
    Then the tour tabs include "<tabs>"
    And More holds "<more>"
    And the tour never shows "<hidden>"
    And the night panel tabs are "<night>"

    Examples:
      | kind          | tabs                                       | more              | hidden                           | night                   |
      | musician      | Plan, Ideas, Set, Notes, Booking           | Numbers, Tickets  | Hang, Menu, Permits, Pitches     | Room, Ideas, Set, Notes |
      | comedian      | Plan, Ideas, Set, Notes, Booking           | Numbers, Tickets  | Covers, Hang, Menu, Pitches      | Room, Ideas, Set, Notes |
      | visual_artist | Plan, Ideas, Hang, Notes, Booking          | Sales, Numbers    | Tickets, Openers, Set, Crowd     | Space, Ideas, Hang, Notes |
      | teacher       | Plan, Ideas, Class, Sessions, Notes, Booking | Numbers         | Tickets, Openers, Set            | Studio, Ideas, Class, Notes |
      | busker        | Plan, Ideas, Pitches, Set, Notes           | Permits, Numbers  | Tickets, Booking, Openers        | Pitch, Ideas, Set, Notes |
      | chef          | Plan, Ideas, Menu, Notes, Booking          | Numbers, Seats    | Set, Hang, Openers, Tickets      | Room, Ideas, Menu, Notes |

  Scenario Outline: A <kind>'s set looks like their work
    Given my profile says I do "<kind>" first
    And my library has a few "<kind>" items with their details
    And a "<kind>" show with all of them in its set
    When I open that show
    Then its set shows "<shape>"
    And each item shows "<detail>"
    And the Library form asks for "<fields>"

    Examples:
      | kind          | shape        | detail     | fields                 |
      | musician      | energy-curve | 128 bpm    | Key, Tempo, Energy     |
      | comedian      | crowd-slot   | Closer     | Place in the set       |
      | visual_artist | wall         | 60 × 80 cm | Size, Price            |
      | chef          | menu-card    | Starter    | Course                 |
      | teacher       | class-bar    | Warm-up    | Part of the class      |
