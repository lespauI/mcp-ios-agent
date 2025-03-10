const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Function to fix import statements with duplicate expect
function fixImports(content) {
  // First fix broken import statements with duplicate 'expect'
  const importRegex = /import\s+{([^}]*)expect([^}]*)expect([^}]*)}\s+from\s+['"]@jest\/globals['"];?/g;
  let newContent = content.replace(importRegex, 'import {$1expect$2$3} from \'@jest/globals\';');
  
  // Handle other cases:
  // 1. Import with chai expect
  newContent = newContent.replace(/import\s+{\s*expect\s*}\s*from\s+['"]chai['"];?/g, '');
  
  // 2. Make sure @jest/globals import includes expect if not already there
  newContent = newContent.replace(/import\s+{([^}]*)}\s+from\s+['"]@jest\/globals['"];?/g, (match, importList) => {
    if (!importList.includes('expect')) {
      return `import {${importList}, expect} from '@jest/globals';`;
    }
    return match;
  });
  
  return newContent;
}

// Map of chai assertions to Jest assertions
const assertionMap = {
  'to.be.true': 'toBe(true)',
  'to.be.false': 'toBe(false)',
  'to.be.undefined': 'toBeUndefined()',
  'to.not.be.undefined': 'toBeDefined()',
  'to.be.null': 'toBeNull()',
  'to.not.be.null': 'not.toBeNull()',
  'to.equal': 'toBe',
  'to.deep.equal': 'toEqual',
  'to.include': 'toContain',
  'to.have.lengthOf': 'toHaveLength',
  'to.have.been.called': 'toHaveBeenCalled()',
  'to.have.been.calledOnce': 'toHaveBeenCalledTimes(1)',
  'to.have.been.calledWith': 'toHaveBeenCalledWith',
  'to.have.been.calledTimes': 'toHaveBeenCalledTimes',
  'to.throw': 'toThrow',
  'to.not.throw': 'not.toThrow()',
  'to.not.equal': 'not.toBe',
  'to.not.deep.equal': 'not.toEqual',
  'to.not.include': 'not.toContain',
  'to.be.greaterThan': 'toBeGreaterThan',
  'to.be.lessThan': 'toBeLessThan',
};

// Function to replace chai expectations with Jest
function replaceExpectations(content) {
  let newContent = content;
  
  // Replace chai assertions with Jest assertions
  Object.entries(assertionMap).forEach(([chai, jest]) => {
    const regex = new RegExp(`expect\\((.+?)\\)\\.${chai.replace(/\./g, '\\.')}\\((.*)\\)`, 'g');
    newContent = newContent.replace(regex, `expect($1).${jest}($2)`);
    
    // Handle cases without parameters
    const regexNoParams = new RegExp(`expect\\((.+?)\\)\\.${chai.replace(/\./g, '\\.')}`, 'g');
    if (!chai.includes('(')) {
      newContent = newContent.replace(regexNoParams, `expect($1).${jest}`);
    }
  });
  
  return newContent;
}

// Process test files
const testFiles = glob.sync(path.join('tests', '**', '*.spec.ts'));
testFiles.forEach(file => {
  try {
    const content = fs.readFileSync(file, 'utf8');
    
    // Fix import statements first
    let updatedContent = fixImports(content);
    
    // Then replace chai expectations with Jest expectations
    updatedContent = replaceExpectations(updatedContent);
    
    if (content !== updatedContent) {
      fs.writeFileSync(file, updatedContent, 'utf8');
      console.log(`Updated ${file}`);
    }
  } catch (error) {
    console.error(`Error processing ${file}:`, error);
  }
});

console.log('Conversion complete!'); 