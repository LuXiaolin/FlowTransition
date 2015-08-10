FlowTransition = {};
FlowTransition.transitionStore = {};
FlowTransition._sections = {};

var _ready = false;

/**
 * The animations will be registered like usual velocity animations, using
 * a two part array:
 *    {translateX: [0, -10]}, {easing: "spring", duration: 325}
 *  -or use a VelocityUI animation:
 *    "transition.fadeIn", {delay: 400, duration: 325}
 *  -or- use an built in txFull screen traversal:
 *     "down", {easing: "spring", duration: 325}
 * You can use a txFull screen option "down", which refers to the direction
 * of travel of the template. It can be moving: down, up, left, or right
 *
 *
 * @TODO: set the content template thing with divs and what-not
 */

Template.section.rendered = function() {
  console.log(this.data.name);
  section = this.data.name;
  FlowTransition._sections[section] = document.getElementById(section);
};

function _setUiHooks(parentElement, transitions) {
  if (!parentElement) {
    return;
  }

  var uiHooks = {};
  if (transitions && transitions.txIn) {
    uiHooks.insertElement = function(node) {
      var _tx = transitions.txIn;

      // set up the hook to apply properties before insertion
      if (_tx.pre) {
        var _property = _.keys(_tx.pre)[0];
        var _value = _.values(_tx.pre)[0];
        $.Velocity.hook(node, _property, _value);
      }

      // insert the new element
      $(node).prependTo(parentElement);

      // start the animation when the DOM is ready
      Meteor.defer(function() {
        $(node).velocity(_tx.animation, _tx.options);
      });
    };
  }

  if (transitions && transitions.txOut) {
    uiHooks.removeElement = function(node) {
      var _tx = transitions.txOut;
      _tx.options = _tx.options || {};

      _tx.options.complete = (function(complete) {
        return function() {
          if (complete) {
            complete.apply(complete, arguments);
          }
          $(node).remove();
        };
      })(_tx.options.complete);

      // set up the hook to apply properties before insertion
      if (_tx.pre) {
        var _property = _.keys(_tx.pre)[0];
        var _value = _.values(_tx.pre)[0];
        $.Velocity.hook(node, _property, _value);
      }

      // start the animation when the DOM is ready
      Meteor.defer(function() {
        $(node).velocity(_tx.animation, _tx.options);
      });
    };
  }

  parentElement._uihooks = uiHooks;
}

function _attachDeepObject() {
  var missingKey = false;
  _.reduce(arguments, function(mem, key) {
    if (!key) {
      missingKey = true;
    }
    return mem = mem[key] = mem[key] || {};
  }, this);

  return !missingKey;
}

function _attachFullPageAnimations() {
  var _txName, _options, _property, _value, _valueOpposite;

  // can either be a string name, or an array in the form [name, options]
  if (typeof this.txFull === 'string') {
    this.txFull = [this.txFull];
  }
  _txName = this.txFull[0];
  _options = this.txFull[1] || {
    duration: 350,
    easing: 'ease-out',
    queue: false
  };

  // ensure that a valid full page transition is being requested
  if (_.indexOf(['down', 'up', 'left', 'right'], _txName) === -1) {
    console.log("'" + _txName + "' is not a registered txFull page transition");
    return;
  }

  // get the property and value for the animations
  _property = (_txName === 'down' || _txName === 'up') ? 'translateY' : 'translateX';
  _value = (_txName === 'down' || _txName === 'right') ? '-100%' : '100%';
  _valueOpposite = (_txName === 'down' || _txName === 'right') ? '100%' : '-100%';

  // create the txIn object as a member of this transition object
  this.txIn = {pre:{}, animation:{}};
  this.txIn.pre[_property] = _value;
  this.txIn.animation[_property] = [0, _value];
  this.txIn.options = _options;

  this.txOut = {animation:{}};
  this.txOut.animation[_property] = [_valueOpposite, 0];
  this.txOut.options = _options;
}

// Add to the transitionStore, an object in the form:
//    [section][newRoute][oldRoute][txDirection][animation,options,pre]
FlowTransition.addTransition = function(transition) {
  var _tx = transition;
  var _fts = FlowTransition.transitionStore;

  var attached = _attachDeepObject.apply(_fts, [_tx.section, _tx.to, _tx.from]);
  if (!attached) {
    console.log("A FlowTransition transition object must have the parameters:" +
            " section, from, to; and should have the parameters: txFull or txIn & txOut.");
  }

  if (_tx.txFull) {
    _attachFullPageAnimations.call(_tx);
  }
  if (_tx.txIn) {
    var _txIn = (typeof _tx.txIn === 'string') ? {animation: _tx.txIn} : _tx.txIn;
    _fts[_tx.section][_tx.to][_tx.from].txIn = _txIn;
  }
  if (_tx.txOut) {
    var _txOut = (typeof _tx.txOut === 'string') ? {animation: _tx.txOut} : _tx.txOut;
    _fts[_tx.section][_tx.to][_tx.from].txOut = _txOut;
  }
};

FlowTransition.applyTransitions = function(newRoute, oldRoute) {
  var _fts = FlowTransition.transitionStore;
  var hasTransition = {};

  _.each(FlowTransition._sections, function(parentElement, section) {
    var transitions = null;
    if (oldRoute && _fts[section] && _fts[section][newRoute] && _fts[section][newRoute][oldRoute]) {
      transitions = _fts[section][newRoute][oldRoute];
    }
    hasTransition[section] = transitions ? true : false;

    // when transitions is null, stale _uihooks will be removed from the parentElement
    _setUiHooks(parentElement, transitions);
  });

  // let the caller know which sections have transitions
  return hasTransition;
};

/**
 * This is the function to call externally to kick off a layout render.
 *
 * arguments = are in the form:
 * [{section1: contentTemplateName2}, {section2: contentTemplateName2}, ...]
 */
FlowTransition.flow = function() {
  var layoutAssignment = arguments;

  if (!_ready) { // make sure the initial Template sections are loaded
    Meteor.defer(function() {
      _ready = true;
      FlowTransition.flow.apply(this, layoutAssignment);
    });
    return;
  }

  var _newLayout = _.extend.apply(null, layoutAssignment);

  var flowCurrent = FlowRouter.current();
  var newRoute = flowCurrent.route.name;
  var oldRoute = flowCurrent.oldRoute ? flowCurrent.oldRoute.name : null;
  var hasTransition = FlowTransition.applyTransitions(newRoute, oldRoute);

  _.each(FlowTransition._sections, function(parentElement, section) {
    var oldNode = parentElement.firstElementChild;
    if (!_newLayout[section]) {
      if (oldNode) {
        Blaze.remove(Blaze.getView(oldNode));
      }
    }
    else {
      var newContent = Template[_newLayout[section]];
      var sameContent = (oldNode && (Blaze.getView(oldNode).name === newContent.viewName));
      if (!sameContent || hasTransition[section]) {
        Blaze.render(newContent, parentElement);
        if (oldNode) {
          Blaze.remove(Blaze.getView(oldNode));
        }
      }
    }
  });
};
