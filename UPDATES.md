# QuizTinker Updates and Enhancements

## Overview

This document outlines all recent updates, enhancements, and improvements made to the QuizTinker platform, including AI-powered quiz generation, reference material processing, and code quality improvements.

## Major Features Added

### 1. AI-Powered Quiz Generation with Gemini

#### Purpose

Automatically generate LET (Licensure Examination for Teachers) board exam-ready multiple-choice questions using Google Generativeai (Gemini 2.5 Flash).

#### Key Features

- **Bloom's Taxonomy Integration**: Questions are distributed across all six levels (Remember, Understand, Apply, Analyze, Evaluate, Create)
- **Target Distribution**: 15% Remember, 20% Understand, 25% Apply, 20% Analyze, 10% Evaluate, 10% Create
- **LET Coverage Support**: Generates questions for multiple specializations including GenEd, ProfEd, Filipino, English, Mathematics, Science, Social Studies, MAPEH, TLE, Values Education, and Rizal
- **Intelligent Retry Mechanism**: Automatically retries if the AI response is truncated to ensure complete question sets

#### Implementation

- Located in `django_backend/quizzes/views.py`
- Endpoint: `POST /api/quizzes/ai-generate/`
- Supports generation of 5-50 questions per request

### 2. Reference Material Processing

#### Supported File Formats

- PDF (with page-level extraction)
- DOCX (Word documents)
- PPTX (PowerPoint presentations)
- TXT (Plain text files)

#### Features

- Automatic text extraction from uploaded files
- Truncation for token optimization (max 8,000 characters)
- Subject detection using keyword matching
- Automatic specialization suggestion based on document content
- File upload limit: 2 files per generation request

#### Implementation

- `extract_reference_text()`: Extracts text from supported file formats
- `_truncate_reference()`: Optimizes extracted content for API calls
- `_detect_reference_subject()`: Auto-detects subject area from reference material

### 3. Language Mode Detection

#### Multi-Language Support

- **Filipino (Tagalog)**: Exclusively for Filipino and Rizal specializations
- **English**: Default for all other specializations

#### Design Decision

Language is determined solely by specialization, not by document keywords. This prevents academic content about Philippines (GenEd/ProfEd) from incorrectly generating in Filipino.

#### Implementation

- `_detect_language_mode()`: Determines language based on specialization
- `_build_language_instruction()`: Generates language-specific prompts for Gemini

### 4. NLP Prompt Preprocessing

#### Purpose

Intelligently parse free-text user prompts to extract structured information.

#### Extracted Information

- **Topic**: Subject matter of quiz questions
- **Question Count**: Number of questions to generate (5-50 range)
- **Language**: Hint for language preference (honored only for Filipino)

#### Implementation

- Uses Gemini for fast NLP preprocessing
- Falls back to regex extraction if NLP fails
- Prevents unnecessary API errors and optimizes token usage

### 5. Prompt Usefulness Validation

#### Validation Criteria

- Minimum 8 characters
- At least 50% alphabetic characters
- Not in filler phrase list (ok, test, n/a, hello, etc.)
- Not a quantity-only request (e.g., "generate 10 questions")

#### Purpose

Ensures only meaningful quiz generation requests are processed.

### 6. Code Quality Improvements

#### Comment Cleanup

- Removed all inline comments from `chatbot/views.py` and `quizzes/views.py`
- Retained section headers with `# -----------` format for code organization
- Improved code readability while maintaining structure documentation

#### Benefits

- Cleaner codebase focusing on logic and functionality
- Section headers provide clear navigation through large files
- Easier code maintenance and future updates

## Updated Endpoints

### Quiz Generation

```
POST /api/quizzes/ai-generate/
```

Request body:

```json
{
  "title": "Quiz Title",
  "subtitle": "Optional subtitle",
  "category": "GenEd|ProfEd",
  "specialization": "Filipino|English|Mathematics|Science|Social Studies|MAPEH|TLE|Values Education|Rizal",
  "prompt": "Free-text quiz generation request",
  "num_questions": 10,
  "reference_file_1": "optional_pdf_or_docx",
  "reference_file_2": "optional_second_file"
}
```

## Technical Architecture

### Quiz Generation Pipeline

1. **Input Validation**: Prompt usefulness check
2. **NLP Preprocessing**: Extract topic, count, and language hint
3. **File Processing**: Extract and truncate reference materials
4. **Specialization Resolution**: Normalize user input or auto-detect from files
5. **Language Detection**: Determine Filipino vs English mode
6. **Prompt Building**: Generate optimized Gemini instruction set
7. **Generation**: Call Gemini with full context
8. **Retry Logic**: Handle truncated responses
9. **Persistence**: Save questions as QuizItems with metadata

### Metadata Storage

Generated quizzes store comprehensive metadata including:

- Source material (if provided)
- Language mode used
- Specialization confidence level (high/inferred/none)
- Bloom's taxonomy distribution
- File references

## Dependencies

### New Packages Added

- `pdfplumber>=0.9.0` - PDF text extraction with page-level granularity
- `python-docx>=0.8.11` - DOCX (Word) document processing
- `python-pptx>=0.6.21` - PPTX (PowerPoint) slide processing

### Existing Packages (Updated)

- `google-generativeai==0.8.6` - Gemini AI integration

All dependencies are listed in `django_backend/requirements.txt`.

## File Structure Changes

```
django_backend/
├── quizzes/
│   ├── views.py (enhanced with AI generation)
│   ├── models.py
│   ├── serializers.py
│   └── ...
├── chatbot/
│   ├── views.py (code quality improvements)
│   └── ...
└── requirements.txt (updated with new dependencies)
```

## Usage Examples

### Basic Quiz Generation

```python
POST /api/quizzes/ai-generate/
{
  "title": "Mathematics Quiz",
  "category": "ProfEd",
  "specialization": "Mathematics",
  "prompt": "Generate 10 questions on Algebra and Geometry for ProfEd",
  "num_questions": 10
}
```

### With Reference Material

```python
POST /api/quizzes/ai-generate/
{
  "title": "Science Quiz",
  "category": "GenEd",
  "prompt": "Create questions based on the uploaded material",
  "reference_file_1": <PDF file>,
  "num_questions": 15
}
```

### Filipino Specialization

```python
POST /api/quizzes/ai-generate/
{
  "title": "Filipino Literature Quiz",
  "specialization": "Filipino",
  "prompt": "Generate questions about Philippine literature",
  "num_questions": 8
}
```

## Environment Requirements

Ensure the following is configured in your `.env` file:

```
GEMINI_API_KEY=your_gemini_api_key_here
```

## Testing Recommendations

1. Test quiz generation with various specializations
2. Verify Bloom's taxonomy distribution across generated questions
3. Test with multiple file formats (PDF, DOCX, PPTX)
4. Verify language mode switching for Filipino content
5. Test edge cases: truncated responses, invalid files, empty prompts

## Performance Considerations

- Reference material is truncated to 8,000 characters to optimize token usage
- NLP preprocessing uses temperature=0.0 for deterministic results
- Quiz generation uses temperature=0.7 for balanced creativity
- Retry mechanism helps recover from truncated API responses
- Pagination and filtering on quiz list endpoints

## Future Enhancements

- Support for additional file formats (XLSX, CSV)
- Custom Bloom's taxonomy distribution settings
- Question difficulty level settings
- Bulk quiz generation from document libraries
- Local language support beyond Filipino
- Question deduplication across quiz sets
- Integration with learning management systems (LMS)

## Known Limitations

- Maximum question count: 50 per request
- File size limits enforced by Django (default 2.5MB)
- API rate limiting based on Gemini's quota
- Language support currently limited to English and Filipino
- Specialization auto-detection relies on keyword matching

## Support and Troubleshooting

### Common Issues

**Problem**: Gemini API errors

- Solution: Verify GEMINI_API_KEY in .env file

**Problem**: File upload failures

- Solution: Ensure file is in supported format and under size limit

**Problem**: Questions generated in wrong language

- Solution: Check specialization setting; only Filipino/Rizal generate in Filipino

**Problem**: Incomplete question sets

- Solution: Retry mechanism should recover; if not, reduce requested question count

## Version History

- **v1.0** (March 2026): Initial AI quiz generation, reference material processing, Bloom's taxonomy integration
- **v0.9**: Code cleanup and comment reorganization

---

For more information or issues, contact the development team or create an issue in the GitHub repository.
