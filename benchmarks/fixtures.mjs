const tex = String.raw;

export const core = [
  "x^2+y^2=r^2",
  tex`x=\frac{-b\pm\sqrt{b^2-4ac}}{2a}`,
  tex`\int_0^1 \frac{x^2}{1+x}\,dx`,
  tex`\sum_{k=1}^{n} k=\frac{n(n+1)}{2}`,
  tex`\left(\frac{a_i}{b_i}\right)^{2}+\sqrt[3]{2}`,
  tex`\sin^2(\theta)+\cos^2(\theta)=1`,
  tex`\frac{\partial^2 f}{\partial x\partial y}=0`,
  tex`\alpha\in\left[0,1\right],\quad\beta\ne0`,
];

export const matrices = [
  tex`\begin{pmatrix}1&2\\3&4\end{pmatrix}`,
  tex`\begin{bmatrix}a&b&c\\d&e&f\\g&h&i\end{bmatrix}`,
  tex`\begin{vmatrix}\frac12&0\\0&\sqrt{2}\end{vmatrix}`,
  tex`\begin{aligned}x+y&=2\\x-y&=0\end{aligned}`,
  tex`\begin{cases}x^2&x>0\\0&x\le0\end{cases}`,
  tex`A=\begin{Vmatrix}a&b\\c&d\end{Vmatrix}`,
];

export const macros = [
  tex`\newcommand{\sq}[1]{{#1}^2}\sq{x+y}`,
  tex`\newcommand{\at}[2]{#1_{#2}}\at{x}{1}+\at{y}{2}`,
  tex`\def\pair(#1,#2){\frac{#1}{#2}}\pair({a+b},c)`,
  tex`\def\old#1{\sqrt{#1}}\let\save\old\def\old#1{#1^2}\save{x}+\old{x}`,
  tex`\newcommand{\rev}[2]{\left(#2,#1\right)}\rev{\alpha}{\beta}`,
  tex`\newcommand{\norm}[1]{\left\|#1\right\|}\norm{\begin{bmatrix}1&2\\3&4\end{bmatrix}}`,
];

export const compatibility = {
  "Optional default in newcommand": tex`\newcommand{\at}[2][x]{#1_{#2}}\at{1}+\at[y]{2}`,
  "Eager edef definition": tex`\def\value{x}\edef\snapshot{\value}\def\value{y}\snapshot`,
  "Blackboard bold": tex`\mathbb{R}`,
  "Binomial coefficients": tex`\binom{n}{k}`,
  "Labeled arrows": tex`A\xrightarrow{f}B`,
  "Arrays with column specifications": tex`\begin{array}{lr}a&b\\c&d\end{array}`,
  "Equation tags": tex`\begin{equation}x=1\tag{5}\end{equation}`,
};
