import { InvalidParametersError } from '@libp2p/interface';
import { CID } from 'multiformats/cid';
function isIterable(thing) {
    return Symbol.iterator in thing;
}
function isAsyncIterable(thing) {
    return Symbol.asyncIterator in thing;
}
function isCID(thing) {
    return CID.asCID(thing) != null;
}
/**
 * Transform one of:
 *
 * ```ts
 * CID
 * String
 * { cid: CID recursive, metadata }
 * { path: String recursive, metadata }
 * Iterable<CID>
 * Iterable<String>
 * Iterable<{ cid: CID recursive, metadata }>
 * Iterable<{ path: String recursive, metadata }>
 * AsyncIterable<CID>
 * AsyncIterable<String>
 * AsyncIterable<{ cid: CID recursive, metadata }>
 * AsyncIterable<{ path: String recursive, metadata }>
 * ```
 * Into:
 *
 * ```ts
 * AsyncIterable<{ path: CID|String, recursive:boolean, metadata }>
 * ```
 */
export async function* normaliseInput(input) {
    // must give us something
    if (input === null || input === undefined) {
        throw new InvalidParametersError(`Unexpected input: ${input}`);
    }
    // CID
    const cid = CID.asCID(input);
    if (cid != null) {
        yield toPin({ cid });
        return;
    }
    if (typeof input === 'string') {
        yield toPin({ path: input });
        return;
    }
    // { cid: CID recursive, metadata }
    // @ts-expect-error - it still could be iterable or async iterable
    if (input.cid != null || input.path != null) {
        // @ts-expect-error cannot derive type
        return yield toPin(input);
    }
    // Iterable<?>
    if (isIterable(input)) {
        const iterator = input[Symbol.iterator]();
        const first = iterator.next();
        if (first.done === true) {
            return iterator;
        }
        // Iterable<ToPin>
        yield toPin(toPinnable(first.value));
        for (const obj of iterator) {
            yield toPin(toPinnable(obj));
        }
        return;
    }
    // AsyncIterable<?>
    if (isAsyncIterable(input)) {
        const iterator = input[Symbol.asyncIterator]();
        const first = await iterator.next();
        if (first.done === true) {
            return iterator;
        }
        // AsyncIterable<ToPin>
        yield toPin(toPinnable(first.value));
        for await (const obj of iterator) {
            yield toPin(toPinnable(obj));
        }
        return;
    }
    throw new InvalidParametersError(`Unexpected input: ${typeof input}`);
}
function toPinnable(input) {
    if (isCID(input)) {
        return { cid: input };
    }
    if (typeof input === 'string') {
        return { path: input };
    }
    if (typeof input === 'object' && (input.cid != null || input.path != null)) {
        return input;
    }
    throw new InvalidParametersError(`Unexpected input: ${typeof input}`);
}
function toPin(input) {
    const path = input.cid ?? (input.path != null ? `${input.path}` : undefined);
    if (path == null) {
        throw new InvalidParametersError('Unexpected input: Please pass either a CID or an IPFS path');
    }
    const pin = {
        path,
        recursive: input.recursive !== false
    };
    if (input.metadata != null) {
        pin.metadata = input.metadata;
    }
    if (input.name != null) {
        pin.name = input.name;
    }
    return pin;
}
//# sourceMappingURL=normalise-input.js.map