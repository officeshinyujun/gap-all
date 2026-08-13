#!/usr/bin/env python3
"""Populate needs_review cards in all-concept-tags-offline.json from study-rebuild unit-*.json data."""
import json, os, glob

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TEXTBOOK = os.path.join(ROOT, 'textbook')
OUTPUT_DIR = os.path.join(TEXTBOOK, '_v2', 'rebuild', 'industry')
STUDY_REBUILD_DIR = os.path.join(TEXTBOOK, '_v2', 'study-rebuild', 'industry')

def normalize(s):
    return ''.join(c for c in s.lower() if c.isalnum())

def build_study_lookup():
    """Build a map of normalized tag name -> card data from study-rebuild files."""
    lookup = {}
    for fname in sorted(glob.glob(os.path.join(STUDY_REBUILD_DIR, 'unit-*.json'))):
        data = json.load(open(fname, encoding='utf-8'))
        for card in data.get('cards', []):
            key = normalize(card['name'])
            lookup[key] = card
    return lookup

def concept_markdown(card):
    """Build conceptContent markdown from structuredEvidence or enrichedDefinition."""
    cc = card.get('conceptContent', {})
    if isinstance(cc, dict):
        se = cc.get('structuredEvidence', [])
        if se:
            parts = []
            for section in se:
                if 'subsections' in section:
                    for sub in section.get('subsections', []):
                        parts.append(_sub_md(section, sub))
                else:
                    parts.append(_sub_md(None, section))
            return '\n\n'.join(parts)
        return cc.get('enrichedDefinition', cc.get('definition', ''))
    return str(cc) if cc else ''

def _sub_md(section, sub):
    lines = []
    title = sub.get('title', '')
    if title:
        lines.append(f"## {title}")
    expl = sub.get('explanation', '')
    if expl:
        lines.append(expl)
    kps = sub.get('keyPoints', [])
    if kps:
        lines.append('\n'.join(f'- {kp}' for kp in kps))
    table = sub.get('table', '')
    if table:
        lines.append(table)
    exam = sub.get('examPoints', [])
    if exam:
        lines.append('### 시험 출제 포인트')
        lines.append('\n'.join(f'- {e}' for e in exam))
    pitfalls = sub.get('pitfalls', [])
    if pitfalls:
        lines.append('### 주의사항')
        lines.append('\n'.join(f'- {p}' for p in pitfalls))
    return '\n\n'.join(lines)

def main():
    # Load target artifact
    artifact_path = os.path.join(OUTPUT_DIR, 'all-concept-tags-offline.json')
    cards = json.load(open(artifact_path, encoding='utf-8'))

    # Build study-rebuild lookup
    lookup = build_study_lookup()
    print(f"Loaded {len(lookup)} study-rebuild cards")

    populated = 0
    not_found = []

    for card in cards:
        if card['_offline']['status'] != 'needs_review':
            continue
        key = normalize(card['name'])
        sr_card = lookup.get(key)
        if not sr_card:
            not_found.append(card['name'])
            continue

        desc = sr_card.get('description', '')
        kps = sr_card.get('keyPoints', [])
        cm = concept_markdown(sr_card)

        card['description'] = desc
        card['definition'] = desc
        card['enriched_definition'] = desc
        card['enrichedDefinition'] = desc
        card['keyPoints'] = kps
        card['key_points'] = kps
        card['examTips'] = []
        card['textbookExcerpt'] = cm
        card['textbook_excerpt'] = cm
        card['conceptContent'] = cm
        card['contentStatus'] = 'complete'
        card['reviewStatus'] = 'textbook_only'
        card['_offline']['status'] = 'populated_from_structured'
        card['_offline']['source'] = 'study-rebuild-structured'

        # sampleQuestion from study-rebuild if present
        sq = sr_card.get('sampleQuestion')
        if sq:
            card['sampleQuestion'] = sq
            card['realQuestion'] = sq.get('realQuestion', None)

        populated += 1

    # Write artifact
    json.dump(cards, open(artifact_path, 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
    print(f"Populated: {populated}, Not found: {len(not_found)}")

    # Update report
    report_path = os.path.join(OUTPUT_DIR, 'all-concept-tags-offline-report.json')
    report = json.load(open(report_path, encoding='utf-8'))

    matched = sum(1 for c in cards if c['_offline']['status'] == 'matched')
    textbook_only = sum(1 for c in cards if c['_offline']['status'] == 'textbook_only')
    needs_review = sum(1 for c in cards if c['_offline']['status'] == 'needs_review')
    populated_from = sum(1 for c in cards if c['_offline']['status'] == 'populated_from_structured')

    report['matched'] = matched
    report['textbookOnly'] = textbook_only
    report['needsReview'] = needs_review
    report['populatedFromStructured'] = populated_from
    report['corrected'] = populated  # all populated were corrected
    report['needsReviewTags'] = not_found
    report['missingTags'] = not_found

    json.dump(report, open(report_path, 'w', encoding='utf-8'), indent=2, ensure_ascii=False)

    print(f"\nReport: matched={matched}, textbookOnly={textbook_only}, needsReview={needs_review}, populatedFromStructured={populated_from}")
    if not_found:
        print(f"\nNOT FOUND ({len(not_found)}):")
        for name in not_found:
            print(f"  - {name}")

if __name__ == '__main__':
    main()
