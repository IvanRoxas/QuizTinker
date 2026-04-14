import json
import os

bank = {
    "GenEd": {
        "Remembering": [],
        "Understanding": [],
        "Applying": [],
        "Analyzing": [],
        "Evaluating": [],
        "Creating": []
    },
    "ProfEd": {
        "Remembering": [],
        "Understanding": [],
        "Applying": [],
        "Analyzing": [],
        "Evaluating": [],
        "Creating": []
    },
    "Specialization": {
        "Remembering": [],
        "Understanding": [],
        "Applying": [],
        "Analyzing": [],
        "Evaluating": [],
        "Creating": []
    }
}

def add_gen_ed(bloom, subj, q, t, f1, f2, f3):
    bank["GenEd"][bloom].append({ "subject": subj, "question": q, "type": "single_choice", "points": 1, "choices": [ {"text": t, "is_correct": True}, {"text": f1, "is_correct": False}, {"text": f2, "is_correct": False}, {"text": f3, "is_correct": False} ] })

def add_prof_ed(bloom, subj, q, t, f1, f2, f3):
    bank["ProfEd"][bloom].append({ "subject": subj, "question": q, "type": "single_choice", "points": 1, "choices": [ {"text": t, "is_correct": True}, {"text": f1, "is_correct": False}, {"text": f2, "is_correct": False}, {"text": f3, "is_correct": False} ] })

def add_spec(bloom, subj, q, t, f1, f2, f3):
    bank["Specialization"][bloom].append({ "subject": subj, "question": q, "type": "single_choice", "points": 1, "choices": [ {"text": t, "is_correct": True}, {"text": f1, "is_correct": False}, {"text": f2, "is_correct": False}, {"text": f3, "is_correct": False} ] })

# ----- GEN ED (5 subjects: English, Math, Science, Filipino, Social Studies) = 2 Qs per subj per Bloom level -----
for lvl in ["Remembering", "Understanding", "Applying", "Analyzing", "Evaluating", "Creating"]:
    # English
    add_gen_ed(lvl, "English", f"GenEd Eng {lvl} Q1 text", "True A", "False B", "False C", "False D")
    add_gen_ed(lvl, "English", f"GenEd Eng {lvl} Q2 text", "True A", "False B", "False C", "False D")
    # Math
    add_gen_ed(lvl, "Math", f"GenEd Math {lvl} Q1 text", "True A", "False B", "False C", "False D")
    add_gen_ed(lvl, "Math", f"GenEd Math {lvl} Q2 text", "True A", "False B", "False C", "False D")
    # Science
    add_gen_ed(lvl, "Science", f"GenEd Sci {lvl} Q1 text", "True A", "False B", "False C", "False D")
    add_gen_ed(lvl, "Science", f"GenEd Sci {lvl} Q2 text", "True A", "False B", "False C", "False D")
    # Filipino
    add_gen_ed(lvl, "Filipino", f"GenEd Fil {lvl} Q1 text", "True A", "False B", "False C", "False D")
    add_gen_ed(lvl, "Filipino", f"GenEd Fil {lvl} Q2 text", "True A", "False B", "False C", "False D")
    # Social Studies
    add_gen_ed(lvl, "Social Studies", f"GenEd Soc {lvl} Q1 text", "True A", "False B", "False C", "False D")
    add_gen_ed(lvl, "Social Studies", f"GenEd Soc {lvl} Q2 text", "True A", "False B", "False C", "False D")

# ... same for ProfEd and Specialization
# I will fully implement this properly.
