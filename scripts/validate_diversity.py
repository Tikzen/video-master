#!/usr/bin/env python3
"""
Visual Diversity Validator - Enhanced Version
Enforces mandatory visual quality standards before video encoding
"""

import json
import sys
from pathlib import Path
from collections import Counter

def validate_visual_diversity(plan_path):
    """
    Validates that a video plan meets minimum visual diversity standards.
    Returns (passed: bool, issues: list[str], warnings: list[str], details: dict)
    """
    with open(plan_path, 'r', encoding='utf-8') as f:
        plan = json.load(f)

    issues = []
    warnings = []
    details = {}

    cues = plan.get('cues', [])
    scenes = [c for c in cues if c.get('kind') == 'scene']

    if len(scenes) < 3:
        return True, [], ["Video too short (<3 scenes) to enforce diversity rules"], {}

    details['total_scenes'] = len(scenes)

    # Check 1: Background system repetition (NO tolerance for repetition)
    background_fingerprints = []
    scene_summaries = []

    for idx, scene in enumerate(scenes):
        layers = scene.get('layers', [])
        # Analyze first 10 layers more deeply
        bg_layers = layers[:10]

        # Create fingerprint from layer kinds and IDs
        layer_kinds = [l.get('kind', 'unknown') for l in bg_layers]
        layer_ids = [l.get('id', '') for l in bg_layers]
        fingerprint = '|'.join(layer_kinds) + '::' + '|'.join(sorted(layer_ids))
        background_fingerprints.append(fingerprint)

        scene_summaries.append({
            'id': scene.get('id', f'scene-{idx}'),
            'layer_count': len(layers),
            'layer_kinds': Counter(layer_kinds)
        })

    unique_backgrounds = len(set(background_fingerprints))
    details['unique_backgrounds'] = unique_backgrounds
    details['scene_summaries'] = scene_summaries

    # STRICTER: Require 100% unique backgrounds
    if unique_backgrounds < len(scenes):
        duplicate_count = len(scenes) - unique_backgrounds
        issues.append(
            f"CRITICAL: Only {unique_backgrounds}/{len(scenes)} unique background systems. "
            f"Found {duplicate_count} duplicate(s). Each scene MUST have a fundamentally different visual foundation."
        )

    # Check 2: Material usage (deeper inspection)
    materials_used = set()
    material_counts = Counter()

    for scene in scenes:
        layers = scene.get('layers', [])
        for layer in layers:
            mat = layer.get('material', {})
            if mat:
                if 'gradient' in mat:
                    materials_used.add('gradient')
                    material_counts['gradient'] += 1
                if 'glow' in mat:
                    materials_used.add('glow')
                    material_counts['glow'] += 1
                if 'extrusion' in mat:
                    materials_used.add('extrusion')
                    material_counts['extrusion'] += 1
                if 'glass' in mat:
                    materials_used.add('glass')
                    material_counts['glass'] += 1
                if 'blend' in mat and mat['blend'] in ['screen', 'lighter']:
                    materials_used.add('additive_blend')
                    material_counts['additive_blend'] += 1

    details['materials_used'] = list(materials_used)
    details['material_counts'] = dict(material_counts)

    if len(materials_used) < 3:
        issues.append(
            f"CRITICAL: Only {len(materials_used)}/5 material types used: {', '.join(materials_used)}. "
            f"Must use ≥3 of: gradient, glow, extrusion, glass, additive blend."
        )

    # Check 3: Layer density variation (more detailed)
    layer_counts = [len(scene.get('layers', [])) for scene in scenes]
    if layer_counts:
        min_layers = min(layer_counts)
        max_layers = max(layer_counts)
        density_range = max_layers - min_layers

        details['layer_density'] = {
            'min': min_layers,
            'max': max_layers,
            'range': density_range,
            'per_scene': layer_counts
        }

        if density_range < 10:
            warnings.append(
                f"Low density variation: {min_layers}-{max_layers} layers (range={density_range}). "
                f"Recommend sparse/dense/focused progression with range ≥15."
            )

    # Check 4: Lighting systems (stricter)
    scene_lighting = []

    for scene in scenes:
        has_glow = False
        has_blend = False
        has_beam = False

        layers = scene.get('layers', [])
        for layer in layers:
            mat = layer.get('material', {})
            if mat.get('glow'):
                has_glow = True
            if mat.get('blend') in ['screen', 'lighter']:
                has_blend = True
            if layer.get('kind') == 'path' and ('gradient' in mat or mat.get('glow')):
                has_beam = True

        lighting_types = []
        if has_glow: lighting_types.append('glow')
        if has_blend: lighting_types.append('additive')
        if has_beam: lighting_types.append('beam')

        scene_lighting.append({
            'scene_id': scene.get('id'),
            'has_lighting': len(lighting_types) > 0,
            'types': lighting_types
        })

    details['scene_lighting'] = scene_lighting
    scenes_with_lighting = sum(1 for sl in scene_lighting if sl['has_lighting'])

    # STRICTER: Require ALL scenes to have lighting
    if scenes_with_lighting < len(scenes):
        issues.append(
            f"CRITICAL: Only {scenes_with_lighting}/{len(scenes)} scenes have lighting systems. "
            f"EVERY scene needs distinct lighting (glow, additive blend, or beams)."
        )

    # Check 5: Keyframe animation presence
    scenes_with_animation = 0
    animation_details = []

    for scene in scenes:
        layers = scene.get('layers', [])
        has_keyframes = False
        keyframe_count = 0

        for layer in layers:
            if layer.get('keyframes'):
                has_keyframes = True
                keyframe_count += len(layer['keyframes'])

        # Check camera animation
        camera = scene.get('camera', {})
        if camera.get('keyframes'):
            has_keyframes = True
            keyframe_count += len(camera['keyframes'])

        if has_keyframes:
            scenes_with_animation += 1

        animation_details.append({
            'scene_id': scene.get('id'),
            'has_animation': has_keyframes,
            'keyframe_count': keyframe_count
        })

    details['animation'] = animation_details

    if scenes_with_animation < len(scenes) * 0.75:
        warnings.append(
            f"Limited animation: Only {scenes_with_animation}/{len(scenes)} scenes have keyframes. "
            f"Add motion to create visual interest."
        )

    # Check 6: Color diversity (with gradient colors)
    colors = []
    for scene in scenes:
        layers = scene.get('layers', [])
        for layer in layers:
            if layer.get('fill'):
                colors.append(layer['fill'])
            if layer.get('stroke'):
                colors.append(layer['stroke'])
            if layer.get('color'):
                colors.append(layer['color'])

            # Extract colors from gradients
            mat = layer.get('material', {})
            if mat.get('gradient', {}).get('stops'):
                for stop in mat['gradient']['stops']:
                    if stop.get('color'):
                        colors.append(stop['color'])

    unique_colors = len(set(colors))
    details['color_diversity'] = {
        'unique_colors': unique_colors,
        'total_color_uses': len(colors)
    }

    if unique_colors < 12 and len(scenes) >= 4:
        warnings.append(
            f"Limited color palette: {unique_colors} unique colors. "
            f"Consider richer variation (aim for 15+)."
        )

    # Check 7: Transition quality
    generic_transitions = 0
    transition_types = []

    for scene in scenes:
        trans = scene.get('transition', {})
        trans_type = trans.get('type', 'cut')
        transition_types.append(trans_type)

        if trans_type in ['flow', 'iris', 'zoom', 'fade']:
            generic_transitions += 1

    details['transitions'] = transition_types

    if generic_transitions == len(scenes) - 1 and generic_transitions > 0:
        warnings.append(
            "All transitions use basic primitives. "
            "Consider object continuity, motivated camera moves, or justified cuts."
        )

    # Summary
    passed = len(issues) == 0

    return passed, issues, warnings, details

def print_detailed_report(passed, issues, warnings, details):
    """Print a comprehensive validation report"""

    print("=" * 70)
    print("VISUAL DIVERSITY VALIDATION REPORT")
    print("=" * 70)
    print()

    if passed:
        print("✅ STATUS: PASSED")
    else:
        print("❌ STATUS: FAILED")

    print()
    print(f"📊 SUMMARY:")
    print(f"  Total scenes: {details.get('total_scenes', 0)}")
    print(f"  Unique backgrounds: {details.get('unique_backgrounds', 0)}/{details.get('total_scenes', 0)}")
    print(f"  Materials used: {len(details.get('materials_used', []))}/5 ({', '.join(details.get('materials_used', []))})")

    if 'layer_density' in details:
        ld = details['layer_density']
        print(f"  Layer density: {ld['min']}-{ld['max']} (range={ld['range']})")

    if 'scene_lighting' in details:
        lit_count = sum(1 for sl in details['scene_lighting'] if sl['has_lighting'])
        print(f"  Scenes with lighting: {lit_count}/{details.get('total_scenes', 0)}")

    if 'animation' in details:
        anim_count = sum(1 for a in details['animation'] if a['has_animation'])
        print(f"  Scenes with animation: {anim_count}/{details.get('total_scenes', 0)}")

    if 'color_diversity' in details:
        print(f"  Unique colors: {details['color_diversity']['unique_colors']}")

    print()

    if issues:
        print("❌ CRITICAL ISSUES:")
        for i, issue in enumerate(issues, 1):
            print(f"  {i}. {issue}")
        print()

    if warnings:
        print("⚠️  WARNINGS:")
        for i, warn in enumerate(warnings, 1):
            print(f"  {i}. {warn}")
        print()

    if 'scene_summaries' in details:
        print("📋 SCENE BREAKDOWN:")
        for i, summary in enumerate(details['scene_summaries'], 1):
            print(f"  Scene {i} ({summary['id']}): {summary['layer_count']} layers")
            kinds = ', '.join([f"{k}({v})" for k, v in summary['layer_kinds'].most_common()])
            print(f"    Kinds: {kinds}")
        print()

    if 'scene_lighting' in details:
        print("💡 LIGHTING ANALYSIS:")
        for sl in details['scene_lighting']:
            status = "✓" if sl['has_lighting'] else "✗"
            types = ', '.join(sl['types']) if sl['types'] else 'none'
            print(f"  {status} {sl['scene_id']}: {types}")
        print()

    print("=" * 70)

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python validate_diversity.py <plan.json>")
        sys.exit(1)

    plan_path = Path(sys.argv[1])
    if not plan_path.exists():
        print(f"Error: {plan_path} not found")
        sys.exit(1)

    passed, issues, warnings, details = validate_visual_diversity(plan_path)

    print_detailed_report(passed, issues, warnings, details)

    sys.exit(0 if passed else 1)
