# Claylump

Claylumpは仮想DOMを使ったWebコンポーネントのラッパーです。

## はじめてみよう

### 要素の登録

```html
<template cl-element="x-test">
  <h1>Hello World</h1>
  <h2>{{foo}}</h2>
  <h3>{{baz}}</h3>
</template>

<script>
  Claylump('x-test', {
    scope: {
      foo : 'bar',
      baz : 'qux'
    }
  });
</script>
```

### DOMの更新

```javascript
Claylump('x-test', {
  scope: {
    foo : 'bar',
    baz : 'qux'
  },
  attachedCallback: function() {
    setTimeout(function() {
      this.scope.foo = 'changed';
      this.invalidate(); // update (diff & patch) DOM!
    }.bind(this), 1000);
  }
});
```

### イベントの割当て

```javascript
Claylump('x-test', {
  events: {
    'dbclick .js-dbclick': function(evt) {
      alert('hi');
    },
    'click .js-click': 'onClick'
  },
  onClick: function() {
    console.log('click!');
  },
});
```

## 依存モジュール

- [Matt-Esch/virtual-dom](https://github.com/Matt-Esch/virtual-dom)
- [tautologistics/node-htmlparser](https://github.com/tautologistics/node-htmlparser)
- [Polymer/platform](https://github.com/Polymer/platform)

## 今後の課題

- [ ] flux module
- [ ] messaging b/w components

## 現在の制限

- インターネットエクスプローラー10以降(`Window#requestAnimationFrame`, `Element.matches`を使用しているため)
- `<template>`の`is="x-child"`等の継承された要素を使用することはできません。
