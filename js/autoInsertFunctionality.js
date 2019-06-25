/* global Data */

import { isContentEditable, isTextNode, getNodeWindow } from "./pre";

/**
 * @param {String} character to match
 * @param {Number} searchCharIndex (0 or 1) denoting whether to match the
    starting (`{`) or the closing (`}`) characters of an auto-insert combo
    with the `character`
 * @returns {String[]} the auto insert pair if found, else
 */
function searchAutoInsertChars(character, searchCharIndex) {
    const arr = Data.charsToAutoInsertUserList,
        defaultReturn = ["", ""];

    for (let i = 0, len = arr.length; i < len; i++) {
        if (arr[i][searchCharIndex] === character) {
            return arr[i];
        }
    }

    return defaultReturn;
}

// non-breaking space is useful when inserting four concsecutive for tab character
// HTML entities are for HTML nodes, so use \xA0 to insert &nbsp;
function makeSpaceNonBreakingTextnode(string) {
    return string.replace(/ /g, "\xA0");
}

function moveForwardForSpaces(range, textNode, position) {
    const value = textNode.textContent;

    while (/\s/.test(value[position]) && position < value.length) {
        position++;
    }

    range.setStart(textNode, position);
}

function moveBackwardForSpaces(range, textNode, position) {
    const value = textNode.textContent;

    while (/\s/.test(value[position - 1]) && position >= 1) {
        position--;
    }

    range.setEnd(textNode, position);
}

/**
 * for content editable node, when selection is "| abc |"
 * this moves the carets so that it becomes " |abc| "
 * @param {Range} range
 */
function moveSelectionForSurroundingWhitespace(range) {
    if (isTextNode(range.startContainer)) {
        moveForwardForSpaces(range, range.startContainer, range.startOffset);
    }
    if (isTextNode(range.endContainer)) {
        moveBackwardForSpaces(range, range.endContainer, range.endOffset);
    }
}

/**
 *
 * @param {Range} range
 * @param {String} textnodeString
 * @param {Boolean} isStart
 */
function createNewTextNodeForAutoInsert(range, textnodeString, isStart) {
    const textNode = document.createTextNode(textnodeString);
    if (isStart) {
        range.startContainer.insertBefore(textNode, range.startContainer.childNodes[range.startOffset]);
    } else {
        range.endContainer.insertBefore(textNode, range.endContainer.childNodes[range.endOffset]);
    }

    range.setStart(textNode, 0);
    range.setEnd(textNode, 0);
    return textNode;
}

function modifySelection(sel, range) {
    sel.removeAllRanges();
    sel.addRange(range);
}

function insertTextInNode(textNode, text, atPos) {
    const valBefore = textNode.textContent.substr(0, atPos),
        valAfter = textNode.textContent.substr(atPos);

    textNode.textContent = valBefore + text + valAfter;
}

/**
 * ONLY call this function when `startAndEndAreSame`
 * flag is false in iCC
 * @param {Range} range
 * @param {String} content
 */
function insertSingleCharacterContentEditable(range, content, isStart = true, increment) {
    let textNode,
        startPos;

    if (isStart) {
        if (!isTextNode(range.startContainer)) {
            // range node is an element node when it is empty
            textNode = createNewTextNodeForAutoInsert(range, "");
            startPos = 0;
        } else {
            textNode = range.startContainer;
            startPos = range.startOffset;
        }
    } else if (!isTextNode(range.endContainer)) {
        // range node is an element node when it is empty
        textNode = createNewTextNodeForAutoInsert(range, "", false);
        startPos = 0;
    } else {
        textNode = range.endContainer;
        startPos = range.endOffset;
    }

    if (isTextNode(textNode)) {
        insertTextInNode(textNode, content, startPos);
        if (isStart) {
            range.setStart(textNode, startPos + increment);
        } else {
            range.setEnd(textNode, startPos + increment);
        }
    }
}

/**
 *
 * @param {Element} node the parent node (event.target)
 * @param {String} characterStart
 * @param {String} [characterEnd]
 */
function insertCharacterContentEditable(node, characterStart, characterEnd) {
    const win = getNodeWindow(node),
        sel = win.getSelection(),
        range = sel.getRangeAt(0),
        rangeWasCollapsed = range.collapsed;
    let textnodeString,
        caretIncrement;

    // process the characters and their positioning
    characterStart = makeSpaceNonBreakingTextnode(characterStart);
    if (characterEnd) {
        characterEnd = makeSpaceNonBreakingTextnode(characterEnd);
        textnodeString = characterStart + characterEnd;
        caretIncrement = 1;
    } else {
        textnodeString = characterStart;
        caretIncrement = characterStart.length;
    }

    const startAndEndAreSame = rangeWasCollapsed
        || (!rangeWasCollapsed && !Data.wrapSelectionAutoInsert);

    if (startAndEndAreSame) {
        range.deleteContents();

        insertSingleCharacterContentEditable(range, textnodeString, true, caretIncrement);
    } else {
        moveSelectionForSurroundingWhitespace(range);
        insertSingleCharacterContentEditable(range, characterStart, true, characterStart.length);
        if (characterEnd) {
            insertSingleCharacterContentEditable(range, characterEnd, false, 0);
        }
    }

    modifySelection(sel, range);
}

/**
 *
 * @param {Element} node the parent node (event.target)
 * @param {String} characterStart
 * @param {String} characterEnd
 */
function insertCharacter(node, characterStart, characterEnd) {
    if (isContentEditable(node)) {
        insertCharacterContentEditable(node, characterStart, characterEnd);
    } else {
        let text = node.value,
            startPos = node.selectionStart,
            endPos = node.selectionEnd,
            textBefore = text.substring(0, startPos),
            textMid = text.substring(startPos, endPos),
            textAfter = text.substring(endPos),
            // handle trailing spaces
            trimmedSelection = textMid.match(/^(\s*)(\S?(?:.|\n|\r)*\S)(\s*)$/) || [
                "",
                "",
                "",
                "",
            ];

        textBefore += trimmedSelection[1];
        textAfter = trimmedSelection[3] + textAfter;
        textMid = trimmedSelection[2];

        textMid = Data.wrapSelectionAutoInsert ? textMid : "";
        startPos = textBefore.length + +!!characterEnd;
        endPos = startPos + textMid.length;

        node.value = textBefore + characterStart + textMid + (characterEnd || "") + textAfter;
        node.selectionStart = startPos;
        node.selectionEnd = endPos;
    }
}

export { insertCharacter, searchAutoInsertChars };
