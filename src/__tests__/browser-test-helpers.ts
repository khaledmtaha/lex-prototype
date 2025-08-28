/**
 * Browser console test helpers for manual validation.
 * Paste these functions into the browser console to run interactive tests.
 */

// Test Transform Idempotency
export const testIdempotency = `
function testIdempotency() {
  console.log('=== Testing Transform Idempotency ===');
  
  editor.update(() => {
    const root = $getRoot();
    root.clear();
    
    // Test 1: h3 should remain unchanged
    const h3 = $createHeadingNode('h3');
    h3.append($createTextNode('Valid H3'));
    root.append(h3);
    
    // Test 2: h5 should normalize to h3
    const h5 = $createHeadingNode('h5');
    h5.append($createTextNode('Should become H3'));
    root.append(h5);
  });
  
  setTimeout(() => {
    editor.getEditorState().read(() => {
      const children = $getRoot().getChildren();
      console.log('First child tag:', children[0].getTag()); // Should be h3
      console.log('Second child tag:', children[1].getTag()); // Should be h3 (normalized)
    });
    
    // Trigger second update - should be no-op
    editor.update(() => {
      console.log('Second update triggered (should be no-op)');
    });
    
    setTimeout(() => {
      editor.getEditorState().read(() => {
        const children = $getRoot().getChildren();
        console.log('After second update - First:', children[0].getTag());
        console.log('After second update - Second:', children[1].getTag());
      });
    }, 100);
  }, 100);
}
`;

// Test Read-Only Behavior
export const testReadOnly = `
function testReadOnlyBehavior() {
  console.log('=== Testing Read-Only Behavior ===');
  
  // Save current state
  const wasEditable = editor.isEditable();
  
  // Make read-only
  editor.setEditable(false);
  console.log('Editor set to read-only');
  
  // Test formatHeading command
  const success = formatHeading(editor, 'h1');
  console.log('formatHeading result in read-only:', success); // Should be false
  
  // Test keyboard shortcuts
  console.log('Try Cmd+Option+1 (Mac) or Ctrl+Alt+1 (Windows) now - should do nothing');
  
  // Restore after 5 seconds
  setTimeout(() => {
    editor.setEditable(wasEditable);
    console.log('Editor editability restored to:', wasEditable);
  }, 5000);
}
`;

// Test List Guard
export const testListGuard = `
function testListGuard() {
  console.log('=== Testing List Guard ===');
  
  editor.update(() => {
    const root = $getRoot();
    root.clear();
    
    // Create list with item
    const list = $createListNode('bullet');
    const listItem = $createListItemNode();
    listItem.append($createTextNode('This is a list item'));
    list.append(listItem);
    root.append(list);
    
    // Create selection inside list item
    const selection = $createRangeSelection();
    selection.anchor.set(listItem.getKey(), 0, 'text');
    selection.focus.set(listItem.getKey(), 0, 'text');
    $setSelection(selection);
  });
  
  setTimeout(() => {
    // Try to convert list item to heading (should always fail with safer policy)
    const blocked = formatHeading(editor, 'h1');
    console.log('List item conversion blocked (should always be false):', blocked);
    
    console.log('Note: allowInLists option removed for safer default policy');
  }, 100);
}
`;

// Test Paste Normalization
export const testPasteNormalization = `
function testPasteNormalization() {
  console.log('=== Testing Paste Normalization ===');
  console.log('Paste this HTML into the editor:');
  console.log('<h1>Keep H1</h1><h4>Becomes H3</h4><h5>Also H3</h5><h6>Another H3</h6><p>Normal paragraph</p>');
  
  // Monitor for normalization logs
  const originalWarn = console.warn;
  let normalizeCount = 0;
  
  console.warn = function(...args) {
    if (args[0] && args[0].includes('[HeadingPolicy]')) {
      normalizeCount++;
      console.log('✅ Normalization detected:', args[0]);
    }
    originalWarn.apply(console, args);
  };
  
  setTimeout(() => {
    console.warn = originalWarn;
    console.log('Normalization events detected:', normalizeCount);
  }, 3000);
}
`;

// Test Undo Atomicity
export const testUndoAtomicity = `
function testUndoAtomicity() {
  console.log('=== Testing Undo Atomicity ===');
  console.log('1. Clear the editor');
  console.log('2. Paste: <h1>Title</h1><h4>Subtitle</h4><h6>Footer</h6><p>Body</p>');
  console.log('3. Press Cmd+Z (Mac) or Ctrl+Z (Windows)');
  console.log('4. Entire paste should revert in one operation');
  
  // Count blocks before and after
  setTimeout(() => {
    editor.getEditorState().read(() => {
      const blockCount = $getRoot().getChildrenSize();
      console.log('Current block count:', blockCount);
    });
  }, 1000);
}
`;

// Test Tree Invariant
export const testTreeInvariant = `
function testTreeInvariant() {
  console.log('=== Testing Tree Invariant ===');
  
  editor.update(() => {
    const root = $getRoot();
    root.clear();
    
    // Insert disallowed headings directly
    const h4 = $createHeadingNode('h4');
    h4.append($createTextNode('H4 content'));
    
    const h5 = $createHeadingNode('h5');  
    h5.append($createTextNode('H5 content'));
    
    const h6 = $createHeadingNode('h6');
    h6.append($createTextNode('H6 content'));
    
    root.append(h4, h5, h6);
  });
  
  setTimeout(() => {
    editor.getEditorState().read(() => {
      const children = $getRoot().getChildren();
      const allowedTags = ['h1', 'h2', 'h3'];
      let allValid = true;
      
      children.forEach((child, index) => {
        if (child.getType() === 'heading') {
          const tag = child.getTag();
          const isValid = allowedTags.includes(tag);
          console.log('Child ' + index + ' tag:', tag, 'Valid:', isValid);
          if (!isValid) allValid = false;
        }
      });
      
      console.log('All headings valid:', allValid);
    });
  }, 100);
}
`;

// Test Performance
export const testPerformance = `
function testPerformance() {
  console.log('=== Testing Performance ===');
  
  const startTime = performance.now();
  let normalizeCount = 0;
  
  // Monitor normalization
  const originalWarn = console.warn;
  console.warn = function(...args) {
    if (args[0] && args[0].includes('[HeadingPolicy]')) {
      normalizeCount++;
    }
    originalWarn.apply(console, args);
  };
  
  editor.update(() => {
    const root = $getRoot();
    root.clear();
    
    // Create many h4-h6 headings
    for (let i = 0; i < 100; i++) {
      const h4 = $createHeadingNode('h4');
      h4.append($createTextNode('H4 heading ' + i));
      
      const h5 = $createHeadingNode('h5');
      h5.append($createTextNode('H5 heading ' + i));
      
      const h6 = $createHeadingNode('h6');
      h6.append($createTextNode('H6 heading ' + i));
      
      root.append(h4, h5, h6);
    }
  });
  
  setTimeout(() => {
    const endTime = performance.now();
    console.warn = originalWarn;
    
    console.log('Performance test completed');
    console.log('Time taken:', (endTime - startTime).toFixed(2) + 'ms');
    console.log('Normalizations performed:', normalizeCount);
    console.log('Final block count:', 0);
    
    editor.getEditorState().read(() => {
      const blockCount = $getRoot().getChildrenSize();
      console.log('Final block count:', blockCount);
    });
  }, 1000);
}
`;

export const allBrowserTests = `
// Copy and paste this entire block into the browser console

${testIdempotency}

${testReadOnly}

${testListGuard}

${testPasteNormalization}

${testUndoAtomicity}

${testTreeInvariant}

${testPerformance}

// Run all tests
function runAllTests() {
  console.log('🚀 Starting all browser tests...');
  
  testIdempotency();
  
  setTimeout(() => testReadOnlyBehavior(), 2000);
  
  setTimeout(() => testListGuard(), 4000);
  
  setTimeout(() => testTreeInvariant(), 6000);
  
  setTimeout(() => testPerformance(), 8000);
  
  setTimeout(() => {
    console.log('✅ All automated tests completed!');
    console.log('🔬 Now run manual tests:');
    console.log('1. testPasteNormalization() - then paste the HTML shown');
    console.log('2. testUndoAtomicity() - then follow the instructions');
  }, 10000);
}

console.log('✅ Browser test functions loaded!');
console.log('Run runAllTests() to execute all tests');
console.log('Or run individual test functions as needed');
`;