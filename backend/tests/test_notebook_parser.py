"""Tests for the Kindle Notebook paste parser."""

from app.services.notebook_parser import parse_notebook_paste


def test_basic_highlights():
    text = """The Great Gatsby
F. Scott Fitzgerald

Yellow highlight | Location: 150
In my younger and more vulnerable years my father gave me some advice that I've been turning over in my mind ever since.

Yellow highlight | Location: 233
So we beat on, boats against the current, borne back ceaselessly into the past.
"""
    result = parse_notebook_paste(text)
    assert result.title == "The Great Gatsby"
    assert result.author == "F. Scott Fitzgerald"
    assert len(result.highlights) == 2
    assert result.highlights[0].text.startswith("In my younger")
    assert result.highlights[0].location == "150"
    assert result.highlights[1].text.startswith("So we beat on")
    assert result.highlights[1].location == "233"


def test_page_numbers():
    text = """Some Book
Some Author

Yellow highlight | Page: 42
First highlight on page 42.

Blue highlight | Page: 100 | Location: 1500-1505
Second highlight with page and location.
"""
    result = parse_notebook_paste(text)
    assert len(result.highlights) == 2
    assert result.highlights[0].page == 42
    assert result.highlights[0].location == ""
    assert result.highlights[1].page == 100
    assert result.highlights[1].location == "1500-1505"


def test_notes_attach_to_previous_highlight():
    text = """Book Title
Author Name

Yellow highlight | Location: 100
The highlighted passage here.

Note | Location: 100
My note about this passage.

Yellow highlight | Location: 200
Another passage.
"""
    result = parse_notebook_paste(text)
    assert len(result.highlights) == 2
    assert result.highlights[0].text == "The highlighted passage here."
    assert result.highlights[0].note == "My note about this passage."
    assert result.highlights[1].text == "Another passage."
    assert result.highlights[1].note == ""


def test_title_author_override():
    text = """Some Noise
More Noise

Yellow highlight | Location: 50
A highlight.
"""
    result = parse_notebook_paste(text, title="My Book", author="Me")
    assert result.title == "My Book"
    assert result.author == "Me"
    assert len(result.highlights) == 1


def test_noise_lines_filtered():
    text = """The Great Gatsby
F. Scott Fitzgerald
Notebook Export
Last annotated on January 1, 2025

Yellow highlight | Location: 100
Some text here.
"""
    result = parse_notebook_paste(text)
    assert result.title == "The Great Gatsby"
    assert result.author == "F. Scott Fitzgerald"
    assert len(result.highlights) == 1


def test_different_colors():
    text = """Book
Author

Yellow highlight | Location: 10
Yellow text.

Blue highlight | Location: 20
Blue text.

Pink highlight | Location: 30
Pink text.

Orange highlight | Location: 40
Orange text.
"""
    result = parse_notebook_paste(text)
    assert len(result.highlights) == 4
    assert result.highlights[0].color == "yellow"
    assert result.highlights[1].color == "blue"
    assert result.highlights[2].color == "pink"
    assert result.highlights[3].color == "orange"


def test_empty_paste():
    result = parse_notebook_paste("")
    assert result.title == ""
    assert result.author == ""
    assert len(result.highlights) == 0


def test_no_highlights_just_title():
    text = """Some Book Title
Some Author"""
    result = parse_notebook_paste(text)
    assert result.title == "Some Book Title"
    assert result.author == "Some Author"
    assert len(result.highlights) == 0


def test_dedup_within_parse_is_not_parsers_job():
    """Parser should return all highlights, dedup happens at the API layer."""
    text = """Book
Author

Yellow highlight | Location: 10
Same text.

Yellow highlight | Location: 20
Same text.
"""
    result = parse_notebook_paste(text)
    assert len(result.highlights) == 2  # parser doesn't dedup


def test_multiline_highlight():
    text = """Book
Author

Yellow highlight | Location: 10
This is a long highlight
that spans multiple lines
and keeps going.

Yellow highlight | Location: 20
Short one.
"""
    result = parse_notebook_paste(text)
    assert len(result.highlights) == 2
    assert "spans multiple lines" in result.highlights[0].text
    assert "keeps going" in result.highlights[0].text


def test_page_without_colon():
    """Handle 'Page 42' without the colon."""
    text = """Book
Author

Yellow highlight | Page 42
A highlight.
"""
    result = parse_notebook_paste(text)
    assert result.highlights[0].page == 42


def test_by_prefix_in_author():
    text = """The Great Gatsby
by F. Scott Fitzgerald

Yellow highlight | Location: 100
Some text.
"""
    result = parse_notebook_paste(text)
    assert result.author == "F. Scott Fitzgerald"
