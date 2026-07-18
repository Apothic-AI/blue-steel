import { describe, expect, test } from 'bun:test';
import { Observation } from './observation';
import { maskObservations, applyMask } from './masking';

describe('maskObservations with freezeMask', () => {
    test('freezeMask preserves frozen observation mask values', async () => {
        const observations = [
            new Observation('connector:test', 'user', 'obs1'),
            new Observation('connector:test', 'user', 'obs2'),
            new Observation('connector:test', 'user', 'obs3'),
            new Observation('connector:test', 'user', 'obs4'),
        ];
        
        const freezeMask = [true, false, true];
        const mask = await maskObservations(observations, freezeMask);
        
        // First 3 observations should match freezeMask exactly
        expect(mask[0]).toBe(true);
        expect(mask[1]).toBe(false);
        expect(mask[2]).toBe(true);
        // Fourth observation (unfrozen) should be true by default
        expect(mask[3]).toBe(true);
    });

    test('basic dedupe behavior', async () => {
        // First test basic dedupe to understand behavior
        const observations = [
            new Observation('connector:test', 'user', 'content1', { type: 'msg', dedupe: true }),
            new Observation('connector:test', 'user', 'content1', { type: 'msg', dedupe: true }),
            new Observation('connector:test', 'user', 'content2', { type: 'msg', dedupe: true }),
        ];
        
        const mask = await maskObservations(observations);
        // Dedupe keeps the last occurrence when adjacent
        expect(mask).toEqual([false, true, true]);
    });

    test('dedupe preserves frozen observations when equivalent exists in unfrozen', async () => {
        const observations = [
            new Observation('connector:test', 'user', 'duplicate', { type: 'msg', dedupe: true }),
            new Observation('connector:test', 'user', 'unique', { type: 'msg', dedupe: true }),
            new Observation('connector:test', 'user', 'duplicate', { type: 'msg', dedupe: true }), // This duplicates frozen[0]
            new Observation('connector:test', 'user', 'another', { type: 'msg', dedupe: true }),
        ];
        
        // With freezeMask, frozen observation should be preserved since equivalent exists in unfrozen
        const freezeMask = [true, true];
        const maskWithFreeze = await maskObservations(observations, freezeMask);
        expect(maskWithFreeze).toEqual([true, true, true, true]);
    });

    test('limit only applies to unfrozen observations', async () => {
        const observations = [
            new Observation('connector:test', 'user', 'frozen1', { type: 'limited', limit: 2 }),
            new Observation('connector:test', 'user', 'frozen2', { type: 'limited', limit: 2 }),
            new Observation('connector:test', 'user', 'frozen3', { type: 'limited', limit: 2 }),
            new Observation('connector:test', 'user', 'unfrozen1', { type: 'limited', limit: 2 }),
            new Observation('connector:test', 'user', 'unfrozen2', { type: 'limited', limit: 2 }),
            new Observation('connector:test', 'user', 'unfrozen3', { type: 'limited', limit: 2 }),
        ];
        
        // Without freezeMask, only last 2 observations would be kept
        const normalMask = await maskObservations(observations);
        expect(normalMask).toEqual([false, false, false, false, true, true]);
        
        // With freezeMask, frozen observations don't count towards limit
        // So we keep all 3 frozen + last 2 unfrozen
        const freezeMask = [true, true, true];
        const maskWithFreeze = await maskObservations(observations, freezeMask);
        expect(maskWithFreeze).toEqual([true, true, true, false, true, true]);
    });

    test('freezeMask with mixed frozen values and limit', async () => {
        const observations = [
            new Observation('connector:test', 'user', 'frozen1', { type: 'mixed', limit: 1 }),
            new Observation('connector:test', 'user', 'frozen2', { type: 'mixed', limit: 1 }),
            new Observation('connector:test', 'user', 'unfrozen1', { type: 'mixed', limit: 1 }),
            new Observation('connector:test', 'user', 'unfrozen2', { type: 'mixed', limit: 1 }),
        ];
        
        // Freeze mask says to hide frozen2 but show frozen1
        const freezeMask = [true, false];
        const mask = await maskObservations(observations, freezeMask);
        
        // frozen1: true (from freezeMask)
        // frozen2: false (from freezeMask)
        // unfrozen1: false (exceeded limit of 1 for unfrozen)
        // unfrozen2: true (last unfrozen, within limit)
        expect(mask).toEqual([true, false, false, true]);
    });

    test('applyMask filters observations correctly', () => {
        const observations = [
            new Observation('connector:test', 'user', 'obs1'),
            new Observation('connector:test', 'user', 'obs2'),
            new Observation('connector:test', 'user', 'obs3'),
        ];
        
        const mask = [true, false, true];
        const filtered = applyMask(observations, mask);
        
        expect(filtered.length).toBe(2);
        expect(filtered[0].observation.content).toBe('obs1');
        expect(filtered[0].index).toBe(0);
        expect(filtered[1].observation.content).toBe('obs3');
        expect(filtered[1].index).toBe(2);
    });

    test('freezeMask with no typed observations', async () => {
        // Test that untyped observations respect freezeMask
        const observations = [
            new Observation('connector:test', 'user', 'frozen1'),
            new Observation('connector:test', 'user', 'frozen2'),
            new Observation('connector:test', 'user', 'unfrozen1'),
            new Observation('connector:test', 'user', 'unfrozen2'),
        ];
        
        const freezeMask = [false, true];
        const mask = await maskObservations(observations, freezeMask);
        
        // Frozen observations keep their freezeMask values
        // Unfrozen untyped observations remain true
        expect(mask).toEqual([false, true, true, true]);
    });

    test('freezeMask longer than observations array', async () => {
        const observations = [
            new Observation('connector:test', 'user', 'obs1'),
            new Observation('connector:test', 'user', 'obs2'),
        ];
        
        const freezeMask = [true, false, true, false];
        const mask = await maskObservations(observations, freezeMask);
        
        // Should only apply freezeMask to existing observations
        expect(mask.length).toBe(2);
        expect(mask).toEqual([true, false]);
    });
});