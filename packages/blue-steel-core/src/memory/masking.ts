import { Observation } from './observation';

export async function maskObservations(observations: Observation[], freezeMask?: boolean[]): Promise<boolean[]> {
    // If freezeMask provided, will guarantee that first freezeMask.length observations return the same mask provided in freezeMask
    // - for dedupe: adjacent types in frozen section should survive if unfrozen contains that type with an equivalent value, instead of keeping most recent 
    // - for limit: limit should only apply to unfrozen section and should ignore (not count) anything in frozen section
    /**
     * Returns a boolean mask indicating which observations should be visible,
     * based on type-specific `dedupe` and `limit` options specified in `obs.retention`.
     * 
     * For each type:
     * 1. If `dedupe` is true, marks older adjacent identical observations as false,
     *    keeping only the last in such a sequence.
     * 2. If `limit` is set, marks only the last N observations of that type as true.
     * 
     * Deduplication is applied before limiting for each type.
     * Untyped observations (no `obs.retention.type`) are always marked as true.
     * 
     * If freezeMask is provided:
     * - The first freezeMask.length observations will have their mask values frozen
     * - Dedupe will preserve frozen observations if equivalent values exist in unfrozen section
     * - Limit only applies to unfrozen observations
     * 
     * @returns A boolean array where true indicates the observation at that index should be visible
     */
    const frozenCount = freezeMask?.length ?? 0;
    
    // Initialize mask
    const mask = new Array(observations.length).fill(true);
    
    // Copy frozen mask values if provided
    if (freezeMask) {
        for (let i = 0; i < frozenCount && i < observations.length; i++) {
            mask[i] = freezeMask[i];
        }
    }
    
    // Group observations by type, tracking their original indices
    const observationsByType = new Map<string, {
        frozenIndices: number[];
        unfrozenIndices: number[];
        frozenObs: Observation[];
        unfrozenObs: Observation[];
        limit?: number;
        dedupe?: boolean;
    }>();

    observations.forEach((obs, index) => {
        if (obs.retention && obs.retention.type) {
            const type = obs.retention.type;
            if (!observationsByType.has(type)) {
                observationsByType.set(type, {
                    frozenIndices: [],
                    unfrozenIndices: [],
                    frozenObs: [],
                    unfrozenObs: [],
                    limit: obs.retention.limit,
                    dedupe: obs.retention.dedupe,
                });
            }
            const typeData = observationsByType.get(type)!;
            
            if (index < frozenCount) {
                typeData.frozenIndices.push(index);
                typeData.frozenObs.push(obs);
            } else {
                typeData.unfrozenIndices.push(index);
                typeData.unfrozenObs.push(obs);
            }
        }
        // Untyped observations: frozen ones keep their freezeMask value, unfrozen remain true
    });

    // Process each type
    for (const [type, data] of observationsByType.entries()) {
        // Only process unfrozen observations for dedupe and limit
        let visibleUnfrozenIndices = [...data.unfrozenIndices];

        // Apply deduplication to unfrozen section
        if (data.dedupe && data.unfrozenObs.length > 1) {
            const dedupedIndices: number[] = [];
            dedupedIndices.unshift(data.unfrozenIndices[data.unfrozenIndices.length - 1]);

            for (let i = data.unfrozenIndices.length - 2; i >= 0; i--) {
                const currentObs = data.unfrozenObs[i];
                const lastKeptIdx = dedupedIndices[0];
                const lastKeptObs = observations[lastKeptIdx];
                
                if (!(await currentObs.equals(lastKeptObs))) {
                    dedupedIndices.unshift(data.unfrozenIndices[i]);
                }
            }
            visibleUnfrozenIndices = dedupedIndices;
        }
        
        // Special handling for dedupe with frozen observations
        if (data.dedupe && freezeMask) {
            // Check if any frozen observations should be preserved
            // because equivalent values exist in unfrozen section
            const frozenToPreserve = new Set<number>();
            
            for (let i = 0; i < data.frozenIndices.length; i++) {
                const frozenIdx = data.frozenIndices[i];
                if (mask[frozenIdx]) { // Only check if currently visible in freezeMask
                    const frozenObs = data.frozenObs[i];
                    
                    // Check if any unfrozen observation equals this frozen one
                    for (const unfrozenObs of data.unfrozenObs) {
                        if (await frozenObs.equals(unfrozenObs)) {
                            frozenToPreserve.add(frozenIdx);
                            break;
                        }
                    }
                }
            }
            
            // Ensure preserved frozen observations stay visible
            frozenToPreserve.forEach(idx => {
                mask[idx] = true;
            });
        }

        // Apply limit only to unfrozen observations
        if (data.limit !== undefined && data.limit >= 0) {
            if (data.limit === 0) {
                visibleUnfrozenIndices = [];
            } else {
                // Limit only counts unfrozen observations
                visibleUnfrozenIndices = visibleUnfrozenIndices.slice(-data.limit);
            }
        }

        // Mark non-visible unfrozen observations as false
        const visibleSet = new Set(visibleUnfrozenIndices);
        data.unfrozenIndices.forEach(idx => {
            if (!visibleSet.has(idx)) {
                mask[idx] = false;
            }
        });
        
        // Frozen observations keep their freezeMask values (already set above)
    }

    return mask;
}

export interface MaskedObservation {
    observation: Observation;
    index: number;
}

export function applyMask(observations: Observation[], mask: boolean[]): MaskedObservation[] {
    /**
     * Applies a boolean mask to an array of observations, returning only those
     * observations where the corresponding mask value is true, along with their original indices.
     * 
     * @param observations - The array of observations to filter
     * @param mask - Boolean array where true indicates the observation should be included
     * @returns Array of objects containing the observation and its original index
     */
    if (observations.length !== mask.length) {
        throw new Error(`Mask length (${mask.length}) must match observations length (${observations.length})`);
    }
    
    const result: MaskedObservation[] = [];
    observations.forEach((observation, index) => {
        if (mask[index]) {
            result.push({ observation, index });
        }
    });
    return result;
}