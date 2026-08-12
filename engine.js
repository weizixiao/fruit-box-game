(function () {
"use strict";

const BOARD_COLUMNS = 17;
const BOARD_ROWS = 10;
const ROUND_SECONDS = 120;
const TARGET_SUM = 10;
const DAILY_RESET_UTC_HOUR = 5;
const GROUP_SIZE_WEIGHTS = {
    2: 34,
    3: 25,
    4: 17,
    5: 10,
    6: 6,
    7: 4,
    8: 2,
    9: 1,
    10: 1
};
function createSeededRandom(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 4294967296;
    };
}
function randomInteger(random, minimum, maximum) {
    return minimum + Math.floor(random() * (maximum - minimum + 1));
}
function dailyBoardSeed(now = new Date()) {
    const shiftedDate = new Date(now.getTime() - DAILY_RESET_UTC_HOUR * 60 * 60 * 1000);
    return Date.parse(shiftedDate.toISOString().slice(0, 10)) >>> 0;
}
function chooseWeightedIndex(weights, random) {
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let target = random() * total;
    for (let index = 0; index < weights.length; index++) {
        target -= weights[index];
        if (target < 0)
            return index;
    }
    return weights.length - 1;
}
function createGroupSizes(cellCount, groupCount, random) {
    const ways = Array.from({ length: groupCount + 1 }, () => new Float64Array(cellCount + 1));
    ways[0][0] = 1;
    for (let groups = 1; groups <= groupCount; groups++) {
        for (let cells = 2; cells <= cellCount; cells++) {
            for (let size = 2; size <= 10 && size <= cells; size++) {
                ways[groups][cells] += GROUP_SIZE_WEIGHTS[size] * ways[groups - 1][cells - size];
            }
        }
    }
    const sizes = [];
    let remainingCells = cellCount;
    for (let remainingGroups = groupCount; remainingGroups > 0; remainingGroups--) {
        const candidates = [];
        const weights = [];
        for (let size = 2; size <= 10 && size <= remainingCells; size++) {
            const completions = ways[remainingGroups - 1][remainingCells - size];
            if (completions > 0) {
                candidates.push(size);
                weights.push(GROUP_SIZE_WEIGHTS[size] * completions);
            }
        }
        const size = candidates[chooseWeightedIndex(weights, random)];
        sizes.push(size);
        remainingCells -= size;
    }
    return sizes;
}
function createSumTenGroup(size, random) {
    const cuts = Array.from({ length: 9 }, (_, index) => index + 1);
    for (let index = cuts.length - 1; index > 0; index--) {
        const swapIndex = Math.floor(random() * (index + 1));
        [cuts[index], cuts[swapIndex]] = [cuts[swapIndex], cuts[index]];
    }
    const selectedCuts = cuts.slice(0, size - 1).sort((a, b) => a - b);
    const boundaries = [0, ...selectedCuts, TARGET_SUM];
    return boundaries.slice(1).map((boundary, index) => boundary - boundaries[index]);
}
function findPlacementCandidates(active, rows, columns) {
    const prefix = Array.from({ length: rows + 1 }, () => new Uint16Array(columns + 1));
    for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
            prefix[row + 1][column + 1] = prefix[row][column + 1] +
                prefix[row + 1][column] - prefix[row][column] +
                (active[row * columns + column] ? 1 : 0);
        }
    }
    const candidates = new Map();
    const seen = new Set();
    for (let top = 0; top < rows; top++) {
        for (let bottom = top; bottom < rows; bottom++) {
            for (let left = 0; left < columns; left++) {
                for (let right = left; right < columns; right++) {
                    const count = prefix[bottom + 1][right + 1] - prefix[top][right + 1] -
                        prefix[bottom + 1][left] + prefix[top][left];
                    if (count < 2)
                        continue;
                    if (count > 10)
                        break;
                    const cellIds = [];
                    let minRow = rows;
                    let maxRow = -1;
                    let minColumn = columns;
                    let maxColumn = -1;
                    for (let row = top; row <= bottom; row++) {
                        for (let column = left; column <= right; column++) {
                            const id = row * columns + column;
                            if (!active[id])
                                continue;
                            cellIds.push(id);
                            minRow = Math.min(minRow, row);
                            maxRow = Math.max(maxRow, row);
                            minColumn = Math.min(minColumn, column);
                            maxColumn = Math.max(maxColumn, column);
                        }
                    }
                    const key = cellIds.join(",");
                    if (seen.has(key))
                        continue;
                    seen.add(key);
                    const area = (maxRow - minRow + 1) * (maxColumn - minColumn + 1);
                    const candidate = {
                        selection: {
                            top: minRow,
                            right: maxColumn + 1,
                            bottom: maxRow + 1,
                            left: minColumn
                        },
                        cellIds,
                        holes: area - cellIds.length
                    };
                    const matching = candidates.get(count) ?? [];
                    matching.push(candidate);
                    candidates.set(count, matching);
                }
            }
        }
    }
    return candidates;
}
function placeGroups(groups, rows, columns, random) {
    const cellCount = rows * columns;
    const active = new Array(cellCount).fill(true);
    const values = new Array(cellCount).fill(0);
    const unplaced = groups.map((values) => [...values]);
    const solution = [];
    while (unplaced.length > 0) {
        const candidatesBySize = findPlacementCandidates(active, rows, columns);
        const eligibleGroups = unplaced
            .map((group, index) => ({ group, index }))
            .filter(({ group }) => candidatesBySize.has(group.length));
        if (eligibleGroups.length === 0)
            return null;
        const selectedGroup = eligibleGroups[Math.floor(random() * eligibleGroups.length)];
        const candidates = candidatesBySize.get(selectedGroup.group.length);
        const progress = solution.length / groups.length;
        const candidateWeights = candidates.map((candidate) => 1 + candidate.holes * (0.5 + progress * 3));
        const candidate = candidates[chooseWeightedIndex(candidateWeights, random)];
        const groupValues = [...selectedGroup.group];
        for (let index = groupValues.length - 1; index > 0; index--) {
            const swapIndex = Math.floor(random() * (index + 1));
            [groupValues[index], groupValues[swapIndex]] = [groupValues[swapIndex], groupValues[index]];
        }
        candidate.cellIds.forEach((id, index) => {
            values[id] = groupValues[index];
            active[id] = false;
        });
        solution.push({ selection: candidate.selection, cellIds: candidate.cellIds });
        unplaced.splice(selectedGroup.index, 1);
    }
    return {
        board: values.map((value, id) => ({
            id,
            row: Math.floor(id / columns),
            column: id % columns,
            value,
            active: true
        })),
        solution
    };
}
function createSolvableBoard(randomOrSeed = Math.random, rows = BOARD_ROWS, columns = BOARD_COLUMNS) {
    const random = typeof randomOrSeed === "function"
        ? randomOrSeed
        : createSeededRandom(randomOrSeed || 1);
    const cellCount = rows * columns;
    if (cellCount === 0)
        return { board: [], solution: [] };
    if (cellCount === 1)
        throw new RangeError("A solvable board requires at least two cells");
    const minimumGroups = Math.ceil(cellCount / 10);
    const maximumGroups = Math.floor(cellCount / 2);
    const preferredMinimum = Math.max(minimumGroups, Math.min(maximumGroups, Math.round(cellCount * 72 / 170)));
    const preferredMaximum = Math.max(preferredMinimum, Math.min(maximumGroups, Math.round(cellCount * 82 / 170)));
    for (let attempt = 0; attempt < 40; attempt++) {
        const groupCount = randomInteger(random, preferredMinimum, preferredMaximum);
        const groupSizes = createGroupSizes(cellCount, groupCount, random);
        const groups = groupSizes.map((size) => createSumTenGroup(size, random));
        const generated = placeGroups(groups, rows, columns, random);
        if (generated)
            return generated;
    }
    throw new Error("Unable to place a solvable board");
}
function createBoard(randomOrSeed = Math.random, rows = BOARD_ROWS, columns = BOARD_COLUMNS) {
    return createSolvableBoard(randomOrSeed, rows, columns).board;
}
function normalizeSelection(start, end) {
    return {
        top: Math.min(start.y, end.y),
        right: Math.max(start.x, end.x),
        bottom: Math.max(start.y, end.y),
        left: Math.min(start.x, end.x)
    };
}
function isInside(apple, selection) {
    const centerX = apple.column + 0.5;
    const centerY = apple.row + 0.5;
    return centerY > selection.top && centerY < selection.bottom &&
        centerX > selection.left && centerX < selection.right;
}
function inspectSelection(board, selection) {
    const apples = board.filter((apple) => apple.active && isInside(apple, selection));
    return {
        apples,
        count: apples.length,
        sum: apples.reduce((total, apple) => total + apple.value, 0)
    };
}
function clearSelection(board, selection) {
    const inspected = inspectSelection(board, selection);
    if (inspected.sum !== TARGET_SUM)
        return { board, cleared: 0 };
    const ids = new Set(inspected.apples.map((apple) => apple.id));
    return {
        board: board.map((apple) => ids.has(apple.id) ? { ...apple, active: false } : apple),
        cleared: ids.size
    };
}
function findAvailableMove(board) {
    const rows = board.reduce((maximum, apple) => Math.max(maximum, apple.row + 1), 0);
    const columns = board.reduce((maximum, apple) => Math.max(maximum, apple.column + 1), 0);
    for (let top = 0; top < rows; top++) {
        for (let left = 0; left < columns; left++) {
            for (let bottom = top; bottom < rows; bottom++) {
                for (let right = left; right < columns; right++) {
                    const selection = { top, right: right + 1, bottom: bottom + 1, left };
                    const { count, sum } = inspectSelection(board, selection);
                    if (count > 0 && sum === TARGET_SUM)
                        return selection;
                    if (sum > TARGET_SUM)
                        break;
                }
            }
        }
    }
    return null;
}
function findCertifiedMove(board, solution) {
    const activeIds = new Set(board.filter((apple) => apple.active).map((apple) => apple.id));
    for (const step of solution) {
        const activeStepIds = step.cellIds.filter((id) => activeIds.has(id));
        if (activeStepIds.length === 0)
            continue;
        if (activeStepIds.length !== step.cellIds.length)
            return null;
        const inspected = inspectSelection(board, step.selection);
        const inspectedIds = new Set(inspected.apples.map((apple) => apple.id));
        if (inspected.sum !== TARGET_SUM || inspectedIds.size !== step.cellIds.length)
            return null;
        if (step.cellIds.every((id) => inspectedIds.has(id)))
            return step.selection;
        return null;
    }
    return null;
}
function formatTime(milliseconds) {
    const safe = Math.max(0, milliseconds);
    const minutes = Math.floor(safe / 60000);
    const seconds = Math.floor((safe % 60000) / 1000);
    const tenths = Math.floor((safe % 1000) / 100);
    return `${minutes}:${seconds.toString().padStart(2, "0")}.${tenths}`;
}

window.FruitBoxEngine = {
    BOARD_COLUMNS,
    BOARD_ROWS,
    ROUND_SECONDS,
    TARGET_SUM,
    createSeededRandom,
    dailyBoardSeed,
    createSolvableBoard,
    createBoard,
    normalizeSelection,
    isInside,
    inspectSelection,
    clearSelection,
    findAvailableMove,
    findCertifiedMove,
    formatTime
};
})();
