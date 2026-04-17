import prettier from 'prettier';

export async function prettifyJS(src: string): Promise<string> {
  try {
    return await prettier.format(src, {
      parser: 'babel',
      printWidth: 100,
      tabWidth: 2,
      useTabs: false,
      semi: true,
      singleQuote: false,
      trailingComma: 'es5',
      bracketSpacing: true,
      arrowParens: 'always',
    });
  } catch {
    return src;
  }
}
