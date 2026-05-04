# Technical Architecture

This document outlines the design patterns and data flows that make TalonMatch reliable and scalable.

## 1. The "Guest-to-User" Bridge

To maximize user conversion, TalonMatch allows users to upload and analyze resumes as guests.

- **State Persistence:** Resume data is stored in a global `ResumeContext`.
- **Auth Handshake:** Upon clicking "Tailor Resume," guests are prompted to authenticate via Google. We use Supabase session listeners to ensure the existing resume state is successfully "claimed" by the new user ID without requiring a re-upload.

## 2. AST-Validated Writing Suggestions (Upcoming)

To prevent LLM hallucinations or syntax errors in professional documents, we implement a validation layer:

1. **Prompting:** The AI receives the original resume JSON and the Job Description.
2. **Output:** AI generates a proposed rewrite.
3. **Validation:** Before the UI renders the suggestion, an AST parser (Espree) validates the output.
4. **Data Protection:** Technical nodes (e.g., "React", "AWS", "Python") are marked as immutable to prevent the AI from using incorrect synonyms during tone-shifting.

## 3. Data Schema (Supabase)

We utilize PostgreSQL's `jsonb` capabilities to store parsed resumes. This allows for high-speed semantic filtering and "Match %" calculations without the overhead of complex relational joins for every skill.

```mermaid
graph TD
    %% Define Nodes
    PDF[User PDF Resume]
    Raw[Raw Text Extraction (pdf-parse)]
    GroqParse{Groq AI Parse Engine}
    ResumeJSON[Structured Resume JSON (Skills/History)]

    %% Input Sources
    JSearch[JSearch Jobs API]

    %% Output Elements
    Matches[Ranked Job Matches (UI)]

    %% The Tailor Loop (Phase 3 Core)
    Tailor[Tailor Resume Engine]
    LLM[Groq LLM Rewrite]
    AST{**AST Validator Layer**}
    Final[Final Tailored Resume JSON]
    Export[PDF Export (html2pdf)]

    %% Connections
    PDF --> Raw
    Raw --> GroqParse
    GroqParse --> ResumeJSON

    ResumeJSON --> Matches
    JSearch --> Matches

    Matches -->|Select Job| Tailor
    ResumeJSON -->|Resume Input| Tailor
    Tailor --> LLM
    LLM --> AST

    AST -->|Syntax PASS| Final
    AST -->|Syntax FAIL| LLM

    Final --> Export
```
