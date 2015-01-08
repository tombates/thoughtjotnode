/*
* Thought Jot client side js 
*
* Thought Jot currently uses local storage (IndexedDB) to store user filter state information so that when the user
* returns (to the same browser on the same device) they will again see only the jots matching their previous filter
* criteria.
* 
* It must be noted that indexedDB storage is browser specific. For example, Firefox has no access to the indexedDB store
* of Chrome or IE. This means different jots could be entered via different browsers and/or devices, and unless a refresh
* was done with no filtering jots entered via other browsers/devices might not show up.
*
* Additionally, indexedDB is not available in private browsing mode (Incognito in Chrome) and this will disable
* filter state saving. In other words the current version cannot work in private browsing mode.
*
*/

// Encapsulate our stuff in an object to reduce global namespace pollution.
var tj = {};
tj.MS_ONE_DAY = 86400000;            // milliseconds in one day = 24 * 60 * 60 * 1000
tj.DEFAULT_TITLE_LIMIT = 50;

tj.jots = [];
tj.indexedDB = {};
tj.filterObject = {};
tj.indexedDB.db = null;
tj.indexedDB.IDB_SCHEMA_VERSION = 10;

tj.status = {};   // holds the status area information for status string building
tj.status.prefix = "Showing ";
tj.status.total = 0;
tj.status.subset = 0;
tj.status.filterDatesPrefix = "";
tj.status.filterDatesText = "";
tj.status.filterTagsPrefix = "";
tj.status.filterTagsText = "";

tj.filterObject.filterTags = null;
tj.filterObject.filterOnTags = false;     // the checkbox state
tj.filterObject.filterOnTagsOr = false;   // radio btn state
tj.filterObject.filterOnTagsAnd = false;  // radio btn state
tj.filterObject.filterOnDate = false;     // the checkbox state
tj.filterObject.startDate = "";
tj.filterObject.endDate = "";
tj.filterObject.startMS = NaN;
tj.filterObject.endMS = NaN;
tj.filterObject.filterOrder = "newfirst"; // default ordering

// the pagination section: mirrors the header object in the array returned by the /jots/jotlist route
tj.filterObject.jotsFound = 1;
tj.filterObject.jotsReturned = 1;
tj.filterObject.jotsPerPage = 10;
tj.filterObject.pageReturned = 1;
tj.filterObject.pagesTotal = 1;
tj.filterObject.currentPageUrl = "/jots/jotlist/:1at10";
tj.filterObject.prevPageUrl = "/jots/jotlist/:1at10";
tj.filterObject.nextPageUrl = "/jots/jotlist/:1at10";

tagMgr = {};    // encapsulates tag management functions

tj.indexedDB.onerror = function(e){
    console.log(e);
};

/*
* Binds controls and opens a local indexedDB store used for persisting session filter settings.
* Here we retrieve any previously saved filter settings and the authorization data for the
* user's remote storage service before calling NimbusBase library functions for remote retrieval.
*/
tj.indexedDB.open = function() {
    "use strict";
    
    $('.no-fouc').removeClass('no-fouc');

    // Warn user that we do not support early versions of indexedDB
    if(!window.indexedDB) {    
        window.alert("We're sorry. Your browser,\n\n        " + navigator.userAgent + ",\n\ndoesn't support a stable version" +
                     " of IndexedDB, which Thought Jot uses to store your filter settings.\n" +
                     "\n\nSafari does not have full IndexedDB support. If you are on a Mac please try Chrome or Firefox.");
    }

    tj.bindControls();

    //
    // Retreive the locally saved (IndexedDB) filter options state
    //

    var openRequest = indexedDB.open("ThoughtJot", tj.indexedDB.IDB_SCHEMA_VERSION);  // returns an IDBOpenDBRequest object

    openRequest.onupgradeneeded = function(e) {
		var db = e.target.result;

		// A versionchange transaction is started automatically.
		e.target.transaction.onerror = tj.indexedDB.onerror;
		if(db.objectStoreNames.contains("SessionState")) {
			db.deleteObjectStore("SessionState");
		}		
		var store = db.createObjectStore("SessionState", {keyPath: "name"});
	};
	
    // restore the saved session filter state data, if any
	openRequest.onsuccess = function(e) {
		tj.indexedDB.db = e.target.result;        

        var trans = tj.indexedDB.db.transaction(["SessionState"]);
        trans.oncomplete = function(e) {
            //console.log("retrieving filter state: trans.oncomplete() called");
        }
        trans.onerror = function(e) {
            console.log("retrieving filter state: trans.onerror() called");
            console.log(trans.error);
        }

        var store = trans.objectStore("SessionState");
        var fsRequest = store.get(userData.userID);
        
        fsRequest.onsuccess = function(e) {
            if(fsRequest.result == undefined) {
                tj.filterObject.filterTags = null;
                tj.filterObject.startDate = "";
                tj.filterObject.endDate = "";
                tj.filterObject.filterOnTags = false;
                tj.filterObject.filterOnTagsOr = false;
                tj.filterObject.filterOnTagsAnd = false;
                tj.filterObject.filterOnDate = false;
                tj.filterObject.filterOrder = "newfirst";
            }
            else {
                tj.filterObject.filterTags = fsRequest.result.filterTags;
                tj.filterObject.startDate = fsRequest.result.startDate;
                tj.filterObject.endDate = fsRequest.result.endDate;
                tj.filterObject.filterOnTags = fsRequest.result.filterOnTags;
                tj.filterObject.filterOnTagsOr = fsRequest.result.filterOnTagsOr;
                tj.filterObject.filterOnTagsAnd = fsRequest.result.filterOnTagsAnd;
                tj.filterObject.filterOnDate = fsRequest.result.filterOnDate;
                tj.filterObject.filterOrder = fsRequest.result.filterOrder;
            }

            //
            // Render the page, with the restored filter settings in force
            //
            tj.restoreFilteredState();
        };
        
        fsRequest.onerror = function(e) {
            console.log(e.value);
        };
	};
	
	openRequest.onerror = tj.indexedDB.onerror;
};

/*
* Restores the state of things from the previous session, i.e. the
* filter state and its effect on the jots shown.
*/
tj.restoreFilteredState = function() {

    // avoid browser's weird caching of state (yes you Firefox...)
    tj.filtersClear();

    // get all of this user's tags, set the filtering, and show the jots
    $.getJSON('/tags/taglist', function(data) {

        if(data !== null) {
            tagMgr.populateTagSelector(data.tagList.split(","));
            //return;
        }

        tj.restoreFilterControlsState(tj.filterObject.filterTags);
        tj.showFilteredJots();
    });    
}

tj.bindControls = function() {
    // bind CTL-s for saving edits to a jot
    $(window).bind('keydown', function(event) {
        if (event.ctrlKey || event.metaKey) {
            switch (String.fromCharCode(event.which).toLowerCase()) {
            case 's':
                event.preventDefault();

                // if there is a jot being edited, simulate user clicking check (save) button in the jot

                // Not using jQuery trigger because we don't have a sep id for each edit link so we can't
                // use a jQuery selector to get at the right link. But we already have the link itself in hand
                // in tj.editing so we use a more direct method. But this has its own issues as FF does not
                // support click, and IE does not fully support CustomEvent which is the supposed
                // replacement for the deprecated createEvent WHICH DOES WORK in IE, FF and Chrome. Ugh.

                //if(tj.editing !== null) {
                //    tj.editing.click();  // works in Chrome and IE but not FF
                //}

                // But this works in IE, FF and Chrome:
                var evt = document.createEvent('MouseEvents');   // ugh createEvent is deprecated, see above
                evt.initEvent(
                    'click',
                    false,     // can bubble?
                    true       // cancelable?
                );
                tj.editing.dispatchEvent(evt);
                break;
            }
        }
    });

    // bind JQuery UI date pickers to the end/start date filter fields
    $("#startdate").datepicker();
    $("#enddate").datepicker();

    // the select-all-jots checkbox
    $("#checkall").click(function() {
        $(".selectjot").prop('checked', this.checked);
    });

    // create and bind settings/help dialogs
    $( "#helpDialog" ).dialog({
      autoOpen: false,
      show: {
        effect: "fade",
        duration: 500
      },
      hide: {
        effect: "fade",
        duration: 500
      }
    });
 
    $( "#helpOpener" ).click(function() {
      $( "#helpDialog" ).dialog( "option", "width", 800 );
      $( "#helpDialog" ).dialog( "open" );
    });

    // bind the user menu items
    $('#importJots').click(tj.importJots);
    $('#deleteJots').click(tj.deleteJots);

    // the jots per page input
    $('#jotsPerPage').keyup(function(e) {
        if(e.keyCode === 13) {
            ppageStr = this.value;
            if(ppageStr.trim() === "") {
                this.value = tj.filterObject.jotsPerPage;
                return;
            }
            var count = Number(ppageStr);
            if(isNaN(count) || count < 1) {
                this.value = tj.filterObject.jotsPerPage;
                return;
            }

            count = Math.floor(count);    // incase of non-integer entry

            // update the filterObject and showAllJots
            tj.filterObject.jotsPerPage = count;
            tj.filterObject.currentPageUrl = "/jots/jotlist/:" + String(tj.filterObject.pageReturned) + "at" + String(count);
            tj.showAllJots(tj.filterObject);

        }
    });
}

// TODO move to utils.js
tj.replaceAll = function(find, replace, str) {
    return str.replace(new RegExp(find, 'g'), replace);
}

/*
*  Returns an array containing the commonKeyTS value for all the selected jots.
*/
tj.getSelectedJots = function() {
    var selectedJots = $('input:checkbox:checked.selectjot').map(function() {
        return this.value;    // the commonKeyTS for the jot
    }).get();

    return selectedJots;
}

/*
*  Wrapper for innerAddJot. Validates that there is something to add and generates a
*  default title from the jot content if no title was provided.
*/
tj.addJot = function() {
    var jotComposeArea = document.getElementById('jot_composer');   // a div, no longer a textarea
    var jotContents = jotComposeArea.innerHTML.trim();
    var titleField = document.getElementById('add_titleinput');
    var title = titleField.value;

    if(jotContents === undefined || jotContents === "") {
        alert("There is no jot content.");
        return;
    }

    if(title === undefined || title === "") {
        title = tj.getDefaultTitle(jotContents);
    }

    tj.innerAddJot(jotContents, title, jotComposeArea, titleField);
}

/* Creates a title from a substring of the jot text. The title is either the jotText up to the first
*  period, question mark, exclamation point, newline, or the first tj.DEFAULT_TITLE_LIMIT characters
*  (or the jot length if the length of the jot is < tj.DEFAULT_TITLE_LIMIT), whichever is less.
*/
tj.getDefaultTitle = function(jotText) {
    var prefix = jotText.substring(0, tj.DEFAULT_TITLE_LIMIT);

    // first check for newline within the limit and if there use the first line as the title
    // - we separate out the newline piece for clarity. Each browser is different about how
    //   it treats newline in a contenteditable div, and even changes what it does depending
    //   on whether the div is styled with a float or not, crazy as that sounds. IE inserts
    //   <p><p> around newlined text, Chrome uses simple <br>s unless there is a float on the
    //   div in which case it uses <div></div>s and Firefox uses <br><br> for a floated div.
    //   And we are forced to float the compose jot div left or Chrome does it's very weird
    //   move-the-div-down bug upon a newline being inserted into existing text...
    //   In addition, IE does the first <p> wrapping to the text before the first newline!
    //   This means our regex split will have the first element blank instead of it
    //   being the piece we want. Thus this hideous <p> prefix kludge
    if(prefix.search("<p>") === 0)
        prefix = prefix.substr(3);
    var firstline = prefix.split(/\r?\n|<p>|<\/p>|<br>|<div>/g)[0];

    if(firstline === prefix) {
        // there were no newlines within the limit so look for one of ?.!
        var regexp = /^[^!?.]*[.!?]{1}/;
        var matching = prefix.match(regexp);
        if(matching === null)
            return prefix
        else
            return matching[0];
    }
    else
        return firstline;
}

/* Returns an empty string if str has no tags, otherwise it purges str of negative tags */
tj.sanitizeTags = function(tagstr) {
    if(tagstr === undefined || tagstr.trim() === "") {
        tagstr = "";
    }
    else {
        var allTags = tagstr.split(",");
        var okTags = [];
        for(var i = 0; i < allTags.length; i++) {
            if(allTags[i].trim().indexOf("-") != 0)
                okTags.push(allTags[i]);
        }
        tagstr = okTags.join(", ");
    }

    return tagstr;
}

/* Adds a jot to the remote store.
*
*  jotText - the contents (value) of the jot composition area.
*/
tj.innerAddJot = function(jotText, title, composeArea, titleArea) {

    var commonKey = new Date().getTime();
    var nbID = null;
    var tags = document.getElementById('add_tagsinput').value;
    tags = tj.sanitizeTags(tags);    // remove -tags

    var newJot = {
        "commonKeyTS":commonKey,
        "time":commonKey,
        "modTime":commonKey,
        "title":title,
        "jot":jotText,
        "tagList":tags,
        "extra":"none",
        "isTodo":false,
        "done":false,
    };

    // Add the jot
    $.ajax({
        type: 'POST',
        data: JSON.stringify(newJot),
        contentType: "application/json",
        url: '/jots/addjot',
        dataType: 'JSON'
    }).done(function( response ) {    // the .success() method is deprecated as of JQuery 1.5
        
        // Check for successful (blank) response
        if(response.msg === '') {
            composeArea.innerHTML = "";
            titleArea.value = "";
            tj.updateStatus(1);

            var jotDiv = tj.renderJot(newJot);
            var jotsContainer = document.getElementById("jotItems");
            if(tj.filterObject.filterOrder === "newfirst")  {   // newest are currently shown first
                var first = jotsContainer.firstChild;
                jotsContainer.insertBefore(jotDiv, jotsContainer.firstChild);
            }
            else {  // oldest are currently shown first
                jotsContainer.appendChild(jotDiv);
            }                
        }
        else {
            alert("Database error adding jot: "+ response.msg);
        }

    }).fail(function(xhr, textStatus, errorThrown) {    // the .error() method is deprecated as of JQuery 1.5
        alert('Sorry: adding your jot failed.\n\nYour login has probably timed out.\n\nPlease try reloading the page and logging in again.');
    });
};

/*
*   Clears all jots on the page and re-renders them. Used on open, reload, order toggling or filtering. Generally not
*   used just when a single jot is added or deleted or edited. In those cases we update the DOM directly.
*/
tj.showAllJots = function(filterObject) {

    // getSortedRemoteJots is asynchronous as it uses $.getJSON() so we pass the jot div builder as a callback
    tj.getSortedRemoteJots(filterObject, function(jots) {    // retrieve the jots that meet the filter criteria

        var jotsContainer = document.getElementById("jotItems");
        jotsContainer.innerHTML = "";    // delete all the jotdivs as we are about to rereneder them all

        if(jots === undefined || jots.length === 0) {
            tj.reportFiltered();
            return;
        }

        // The jots array actually has a header object containing pagination information as it's first element.
        if(jots.length > 1) {
            var nextJotDiv;
            var fragment = document.createDocumentFragment();
            for(i = 1; i < jots.length; i++) {
         	    nextJotDiv = tj.renderJot(jots[i]);
                fragment.appendChild(nextJotDiv);      
            }
            jotsContainer.appendChild(fragment);
        }

        tj.filterObject.jotsFound = jots[0].jotsFound;    // number that matched the filter criteria
        tj.filterObject.jotsReturned = jots[0].jotsReturned;
        tj.filterObject.pageReturned = jots[0].pageReturned;
        tj.filterObject.pagesTotal = jots[0].pagesTotal;
        tj.filterObject.prevPageUrl = jots[0].prevPageUrl;
        tj.filterObject.nextPageUrl = jots[0].nextPageUrl;
        tj.filterObject.currentPageUrl = "/jots/jotlist/:" + String(jots[0].pageReturned) + "at" + String(tj.filterObject.jotsPerPage);

        tj.reportFiltered();
    });      
};

/* Updates the status string on the page by count. */
tj.updateStatus = function(count) {
    tj.status.total = tj.status.total + count;
    tj.status.subset = tj.status.subset + count;

    tj.reportFiltered();
}

/* Updates the filter status and pagination report area. */
tj.reportFiltered = function() {
    document.getElementById("statusarea").innerHTML = tj.getStatusReport(tj.filterObject);        
    document.getElementById("jotsPerPage").value = String(tj.filterObject.jotsPerPage);
    document.getElementById("currentPageNumber").innerHTML = String(tj.filterObject.pageReturned);
    document.getElementById("pagesTotal").innerHTML = String(tj.filterObject.pagesTotal);

    // make the prev/next page active or not
    var classname = (tj.filterObject.nextPageUrl.indexOf(":0at") == -1) ? "paginationLinks" : "paginationLinksInactive";
    document.getElementById("nextPageLink").className = classname;

    classname = (tj.filterObject.prevPageUrl.indexOf(":0at") == -1) ? "paginationLinks" : "paginationLinksInactive";
    document.getElementById("prevPageLink").className = classname;
}

tj.changeJotsPerPage = function() {
    var ppageStr = prompt("Desired number of jots per page: ", String(tj.filterObject.jotsPerPage));

    // Validate answer
    if(ppageStr === null)
        return;
    var count = Number(ppageStr);
    if(isNaN(count) || count < 1)
        return;

    count = Math.floor(count);    // incase of non-integer entry

    // update the filterObject and showAllJots
    tj.filterObject.jotsPerPage = count;
    tj.filterObject.currentPageUrl = "/jots/jotlist/:" + String(tj.filterObject.pageReturned) + "at" + String(count);
    tj.showAllJots(tj.filterObject);

    //ppageStr = String(count) + " jots per page";
    //document.getElementById("numberPerPage").innerHTML = ppageStr;


}

tj.prevPage = function() {
    if(document.getElementById("prevPageLink").className === "paginationLinksInactive")
        return;

    tj.filterObject.currentPageUrl = tj.filterObject.prevPageUrl;
    tj.showAllJots(tj.filterObject);
}

tj.nextPage = function() {
    if(document.getElementById("nextPageLink").className === "paginationLinksInactive")
        return;
    
    tj.filterObject.currentPageUrl = tj.filterObject.nextPageUrl;
    tj.showAllJots(tj.filterObject);
}

/* Returns a string describing the current list of jots shown and the filtering that led to that list. */
tj.getStatusReport = function(filterObject) {
    var pieces = [tj.status.prefix];
    var tagparts = [];
    var hasNoTagsSearch = filterObject.filterOnTags && filterObject.filterTags.length === 0;

    //if(tj.status.total === tj.status.subset) {
//REDO
    //121514 pieces.push(filterObject.jotsReturned.toString() + " of " + filterObject.jotsFound.toString());
    var warnOutOfFilter = (tj.status.subset === filterObject.jotsReturned) ? "" : ("(*)");
    pieces.push(tj.status.subset.toString() + warnOutOfFilter + " of " + filterObject.jotsFound.toString());        

//REDO
/*
    if(filterObject.jotsReturned === filterObject.jotsFound) {
        //pieces.push("all jots (" + tj.status.total.toString() + ")");
        pieces.push("all jots (" + filterObject.jotsReturned.toString() + ")");
    }
    else
*/
    if(filterObject.filterOnTags || filterObject.filterOnDate)
    {    // create string rep of date and tag filters
        //pieces.push(tj.status.subset.toString() + " of " + tj.status.total.toString());

        //REDO pieces.push(filterObject.jotsReturned.toString() + " of " + filterObject.jotsFound.toString());        
        pieces.push("jots filtered by");

        if(filterObject.filterOnTags && (filterObject.filterOnTagsOr || filterObject.filterOnTagsAnd)) {
            if(filterObject.filterTags.length > 1) {
                if(filterObject.filterOnTagsOr)
                    tagparts.push("tags (OR'd): ");
                else if(filterObject.filterOnTagsAnd)
                    tagparts.push("tags (AND'd): ");
            }
            else if(filterObject.filterTags.length == 1){
                tagparts.push("tag");
            }
            
            if(filterObject.filterTags.length > 0)
                tagparts.push(filterObject.filterTags.join(", "));
        }

        if(filterObject.filterOnDate) {
            var startMS = filterObject.startMS
            var endMS = filterObject.endMS;
            if(!(isNaN(startMS)) || !(isNaN(endMS))) {    // do we have at least one valid date?

                pieces.push("date range: ")

                // if we have both make sure we have the right order
                if(!(isNaN(startMS)) && !(isNaN(endMS))) {
                    if(endMS >= startMS)
                        pieces.push(filterObject.startDate + " - " + filterObject.endDate);
                    else
                        pieces.push(filterObject.endDate + " - " + filterObject.startDate);
                }
                else {   // we have only one valid date
                    if(!(isNaN(startMS)))
                        pieces.push(filterObject.startDate);
                    else
                        pieces.push(filterObject.endDate);
                }

                if(tagparts.length > 0 || hasNoTagsSearch)
                    pieces.push("and by");
            }
        }

        pieces.push(tagparts.join(" "))

        // report TAGLESS search
        if(hasNoTagsSearch) {
            pieces.push("TAGLESS");
        }
    }

    return pieces.join(" ");
}

/*
* Calls the callback with an array of jots in the correct newest/oldest order, and possibly restricted
* to a certain set of tags.
*
* The array returned by the getJSON call has a header object containing pagination information as it's first element.
*
* filterObject - An optional object containing an array of tags, filterMode, and date range information.
*/
tj.getSortedRemoteJots = function(filterObject, callback) {

    // Validate date range before we go to the server
    if((filterObject !== undefined) && filterObject.filterOnDate) {
        filterObject.filterOnDate = tj.validateDateRange(tj.filterObject);
    }

    // This will return a header object with pagination information plus
    // the jots corresponding to that information. For example if the header
    // object key "pageback " has value 2 then the following jots are page 2.
    // This header information will be stored locally in the filterObject and
    // possibly modified for the next request.

    $.getJSON(tj.filterObject.currentPageUrl, filterObject, function(data) {
        var remoteJots = data;
        tj.status.total = remoteJots.length - 1;    // the first object is the header, not a jot
        tj.status.subset = remoteJots.length - 1;

        // render
        callback(remoteJots);
    });
}

/*
*  Returns true if a jot's create date is in the date filter range currently specified. This should not be called
*  until validDateRange() returns true.
*
*  Will treat end date < start date in a friendly way - i.e., as if they were in correct order. This is done directly
*  here and not by altering the filterObject fields.
*/
tj.inDateRange = function(jot, filterObject) {

    var start = tj.filterObject.startMS, end = tj.filterObject.endMS;

    // Deal with having only one date.
    if(isNaN(start))
        start = end - (tj.MS_ONE_DAY - 1);
    else if(isNaN(end))
        end = start + (tj.MS_ONE_DAY - 1);

    // Correct for reversed start and end without altering the filterObject fields.
    if(start > end) {
        end = end - (tj.MS_ONE_DAY - 1);
        start = start + (tj.MS_ONE_DAY - 1);
        var t = start;
        start = end;
        end = t;
    }

    // Finally, the real test.
    if((jot.commonKeyTS >= start) && (jot.commonKeyTS <= end))
        return true;
    else
        return false;
}

/*
*  Converts the date field strings to times in milleseconds, stores the values in the filterObject, and checks each
*  for validity. At least one date must be valid. The order of the dates is not checked as we don't enforce it.
*  Returns false if neither date string is valid, true otherwise. Raises an alert if neither date is valid.
*
*  This should be called and return true before beginning a loop of calling inDateRange() on a set of jots.
*/
tj.validateDateRange = function(filterObject) {
    tj.filterObject.startDate = document.getElementById("startdate").value;
    tj.filterObject.endDate = document.getElementById("enddate").value;
    tj.filterObject.startMS = (new Date(tj.filterObject.startDate).getTime());    // getTime() returns NaN if date is invalid
    tj.filterObject.endMS = (new Date(tj.filterObject.endDate).getTime()) + (tj.MS_ONE_DAY - 1);  // adjust to get the whole day for the end date

    if(isNaN(tj.filterObject.startMS) && isNaN(tj.filterObject.endMS)) {
        alert("Please specify at least one valid date.\n\n If only one date is given it will be\n used for both end and start.")
        return false;
    }
    
    return true;
}

/*
* Creates all the HTML elements for a single jot and sets them into a new div ready to be added to the
* all-jots-div. The caller is reponsible for adding the retuned div to the jotItems div.
*
* row - A jot object
*/
tj.renderJot = function(row) {	
	// a div for each jot
	var jdiv = document.createElement("div");
	jdiv.className = "jotdiv";

	// another div for the title, etc., which will remain when a jot is collapsed
	var titlediv = document.createElement("div");
	titlediv.className = "titlediv";

	// three divs for the left, center, and right columsn within the titlediv
	// these contain the edit link, the title/timestamp/tags editables, and the delete link
    var title_leftdiv = document.createElement("div");
    title_leftdiv.className = "titleleftdiv";
    var title_centerdiv = document.createElement("div");
    title_centerdiv.className = "titlecenterdiv";
    var title_rightdiv = document.createElement("div");
    title_rightdiv.className = "titlerightdiv";

	// title and creation time
	var titlespan = document.createElement("span");
	titlespan.className = "title";
    titlespan.innerHTML = "Title: ";
    var titleinput = document.createElement("input");
    titleinput.setAttribute("type", "text");
    titleinput.setAttribute("maxlength", "150");
    titleinput.className = "titleinput";
    titleinput.disabled = true;
	var timespan = document.createElement("p");
	timespan.className = "timestamp";

    // a paragraph for the tags, within the titlediv central column div
    var tagsspan = document.createElement("span");
    tagsspan.className = "tagsspan";
    tagsspan.innerHTML = "Tags:&nbsp;";
    var tagsinput = document.createElement("input");
    tagsinput.setAttribute("type", "text");
    tagsinput.setAttribute("maxlength", "200");
    tagsinput.className = "tagsinput";
    tagsinput.disabled = true;

	// a paragraph for the jot - simple for now
	var pjot = document.createElement("p");
	pjot.className = "jottext";

    // the select-this-link checkbox for batch operations
    var selectbox = document.createElement("input");
    selectbox.setAttribute("type", "checkbox");
    selectbox.className = "selectjot";
    selectbox.title = "Select or unselect this jot"

    // the delete jot link
	var dellink = document.createElement("a");
	dellink.className = "delete";
	dellink.title = "Delete this jot"
	var delimage = document.createElement("img");
	delimage.src = ".\/images\/delete-20h.png"

    // the edit jot link
	var editlink = document.createElement("a");
	editlink.className = "edit";
	editlink.title = "Edit this jot"
	var editimage = document.createElement("img");
	editimage.src = ".\/images\/pen-20h.png"

	
    // ensure a jot being edited is displayed fully
    title_leftdiv.addEventListener("click", function(e){
        if(pjot.className == "jottext_collapsed")
            pjot.className = "jottext";
    });

    // set the display toggle handler
    title_centerdiv.addEventListener("click", function(e){

        //Note: we do nothing to pjot.classname if it is jottext_editing
        if(pjot.className == "jottext")
            pjot.className = "jottext_collapsed";
        else if(pjot.className == "jottext_collapsed")
            pjot.className = "jottext";
    });

	if(row.title == "none" || row.title == "" || row.title == undefined) {
		titleinput.value = "untitled";
	}
	else
	    titleinput.value = row.title;

    var dt = new Date(Number(row.commonKeyTS));
	timespan.textContent = "created " + dt.toDateString() + " at " + dt.toLocaleTimeString();
	tagsinput.value = row.tagList;
	pjot.innerHTML = row.jot;

    // add the jot id to the selectbox - we don't need a handler since we are just going
    // to grab all the selected ones for a batch operation, but we do need to know with jot
    // each one refers to
    selectbox.value = row.commonKeyTS;

	// wire up Delete link handler and pass the inner deleteJot the key and jotdiv it needs
	dellink.addEventListener("click", function(e) {
		var yesno = confirm("Are you sure you want to delete this jot?\n\nThis is not undoable.");
		if(yesno) {
		    tj.deleteJot(row.commonKeyTS, jdiv);
        }
	});    
	dellink.appendChild(delimage);
	
	editlink.addEventListener("click", function(e) {
		tj.editJot(this, row.commonKeyTS, pjot, titleinput, tagsinput);
	});
	editlink.appendChild(editimage);
	
	title_leftdiv.appendChild(editlink);
	titlediv.appendChild(title_leftdiv)

    titlespan.appendChild(titleinput);
	title_centerdiv.appendChild(titlespan);
    tagsspan.appendChild(tagsinput);
    title_centerdiv.appendChild(tagsspan);
	title_centerdiv.appendChild(timespan);

	titlediv.appendChild(title_centerdiv);
    title_rightdiv.appendChild(dellink);
    title_rightdiv.appendChild(selectbox);
	titlediv.appendChild(title_rightdiv);
	jdiv.appendChild(titlediv);
	jdiv.appendChild(pjot);

	return jdiv;
}

/*
* Makes the jot contenteditable if no jot currently is: only one jot can be editable at a time.
* If the jot is currently editable then it is set not editable and saves the current innerHTML.
* Changes the link image appropriately for the new state (edit or done), if any.
*
* editLink - The in-jot-div edit/save link (i.e. the pencil icon button) that received the click.
* commonKey - The commonKeyTS value for the jot, which links the different store's particular instances of the same jot.
* jotElement - The element containing the jot text (currently a p element, might become a div with sep p's in future...)
* titleinput - The Title field element in the jot's header.
* tagsinput - The Tags: field element in the jot's header.
*/
tj.editJot = function(editLink, commonKey, jotElement, titleinput, tagsinput) {
    var editimg = editLink.childNodes[0];
    if(tj.editing != null && editLink != tj.editing) {
    	alert("Only one jot can be edited at a time.");
    	return;
    }

    if(editLink.title == "Edit this jot") {
        editLink.title = "Save the edit";
        editimg.src = ".\/images\/editdone-20h.png";
	    jotElement.setAttribute("contenteditable", true);
	    jotElement.className = "jottext_editing";
        titleinput.className = "titleinput_editing"
        titleinput.disabled = false;
	    tagsinput.className = "tagsinput_editing";
        tagsinput.disabled = false;
        tj.editing = editLink;
    }
    else {    // time to save the edit

        var newContent = jotElement.innerHTML;
        var newTitle = titleinput.value;
        var newTags = tagsinput.value;

        var newJot = {
            "commonKeyTS":commonKey,
            "time":commonKey,
            "modTime":commonKey,
            "title":newTitle,
            "jot":newContent,
            "tagList":newTags,
            "extra":"none",
            "isTodo":false,
            "done":false
        };

        $.ajax({
            type: 'POST',
            data: JSON.stringify(newJot),
            contentType: "application/json",
            url: '/jots/editjot',
            dataType: 'JSON'
        }).done(function( response ) {
            
            // Check for successful (blank) response
            if(response.msg === '') {
                editLink.title = "Edit this jot";
                editimg.src = ".\/images\/pen-20h.png";
                jotElement.setAttribute("contenteditable", false);
                jotElement.className = "jottext";
                titleinput.disabled = true;
                titleinput.className = "titleinput";
                tagsinput.disabled = true;
                tagsinput.className = "tagsinput";
                tj.editing = null;
            }
            else {
                alert('Database error saving edit: ' + response.msg);
            }

        }).fail(function(xhr, textStatus, errorThrown) {    // the .error() method is deprecated as of JQuery 1.5
            //alert(xhr.responseText);
            alert('Sorry: editing your jot failed.\n\nYour login has probably timed out.\n\nPlease try reloading the page and logging in again.');
        });
 
    }
};

/*
*  Deletes one or more jots from local and remote store(s).
*
*  commonKey - The commonKeyTS value for the jot, which links the different store's particular instances of the same jot.
*  jotDiv - The containing div of the jot, and its child div containing the title, tags, creation timestamp and
*           edit/delete controls. This parameter should not be used if this function is called from deleteJots.
*
*/
tj.deleteJot = function(commonKey, jotDiv) {

    $.ajax({
        type: 'DELETE',
        url: '/jots/deletejot/:' + commonKey,
    }).done(function( response ) {
        
        // Check for successful (blank) response and remove the corresponding div
        if(response.msg === '') {
            tj.showFilteredJots();
        }
        else {
            alert('Database error on remove: ' + response.msg);
        }

    }).fail(function(xhr, textStatus, errorThrown) {    // the .error() method is deprecated as of JQuery 1.5
            //alert(xhr.responseText);
            alert('Sorry: deleting your jot failed.\n\nYour login has probably timed out.\n\nPlease try reloading the page and logging in again.');
    });

};

/*  Deletes multiples jots by calling tj.deleteJot for each selected jot but without the jot's div. When deleting multiple
*   jots we don't remove each div individually, instead we just hit the server to get all the filtered jots again.
*/
tj.deleteJots = function() {

    // the the commonKeyTS values of the selected jots
    var selectedJots = tj.getSelectedJots();

    if(selectedJots === undefined || selectedJots.length === 0) {
        alert("No jots are selected. The deletion is cancelled.");
        return;
    }

    var yesno = confirm("Are you sure you want to delete these " + selectedJots.length + " jots?\n\nThis is not undoable.");
    if(yesno) {
        for(var i = 0; i < selectedJots.length; i++) {
            tj.deleteJot(selectedJots[i]);
        }
    }
}

tj.removeJotDiv = function(jotDiv) {
	// delete the view of the jot by removing it's jotDiv - no more rerendering all the jot view's html!
    var jotsContainer = document.getElementById("jotItems");
    jotsContainer.removeChild(jotDiv);
}

//
// Our action handlers for sort order, date range, etc.
//

/* Toggles the temporal sort order of displayed jots. */
tj.toggleOrdering = function() {
	var toggle = document.getElementById('toggleOrder');
	if(tj.filterObject.filterOrder === "newfirst") {
		toggle.title = "Press to show newest jots first.";
		tj.filterObject.filterOrder = "oldfirst";
	}
	else {
		toggle.title = "Press to show oldest jots first.";
		tj.filterObject.filterOrder = "newfirst";
	}
    tj.showFilteredJots();
}

tj.raiseCalendar = function(elementID) {
    var which = "#" + elementID;
    $(which).datepicker();
}

/* For some reason Firefox is remembering checkbox and radio states across reloads -- weird.
*  So we explicitly clear them before getting the saved filter settings, as ugly as that is. */
tj.filtersClear = function() {
     document.getElementById("filter_by_date").checked = false;
     document.getElementById("filter_by_tags").checked = false;
}

/* Sets the state of tj.filterObject into the UI controls, typically at page load time. */
//TODO all this checking and unchecking should be done in a fragment to minimize reflow
tj.restoreFilterControlsState = function() {
    // select the tags that were previously selected in the tag selector list
    tagMgr.selectTags(tj.filterObject.filterTags);

    // now restore the state of the filter mode controls
    if(tj.filterObject.filterOnTags) {
        document.getElementById("filter_by_tags").checked = true;
    }
    else {
        document.getElementById("filter_by_tags").checked = false;
    }
    tj.toggleTagFilter();

    if(tj.filterObject.filterOnTagsOr) {
        document.getElementById("filter_by_tags_or").checked = true;
    }
    else {
        document.getElementById("filter_by_tags_or").checked = false;
    }

    if(tj.filterObject.filterOnTagsAnd) {
        document.getElementById("filter_by_tags_and").checked = true;
    }
    else {
        document.getElementById("filter_by_tags_and").checked = false;
    }

    if(tj.filterObject.filterOnDate)
        document.getElementById("filter_by_date").checked = true;
    else
        document.getElementById("filter_by_date").checked = false;
    document.getElementById("startdate").value = tj.filterObject.startDate;
    document.getElementById("enddate").value = tj.filterObject.endDate;
    tj.toggleDateFilter();
}

/* Gathers currently selected and staged tags, and any filter state
*  and persists them for the next session using this browser on this device. */
// TODO: Stop using IndexedDB and store the user filter state in the remote db
tj.indexedDB.persistFilterControlsState = function(filterObject) {

    //var db = tj.indexedDB.db;
    var trans = tj.indexedDB.db.transaction(["SessionState"], "readwrite");

    trans.oncomplete = function(e) {
        //console.log("storing session state trans.oncomplete() called");
    }

    trans.onerror = function(e) {
        console.log("storing session state trans.onerror() called");
        console.log(trans.error);
    }

    var store = trans.objectStore("SessionState");
    
    var row = {"name":userData.userID, "filterMode":filterObject.filterMode,
               "filterOnTags":filterObject.filterOnTags,
               "filterOnTagsOr":filterObject.filterOnTagsOr,
               "filterOnTagsAnd":filterObject.filterOnTagsAnd,
               "filterTags":filterObject.filterTags,
               "filterOnDate":filterObject.filterOnDate,
               "startDate":filterObject.startDate, "endDate":filterObject.endDate,
               "filterOrder":filterObject.filterOrder};
    var request = store.put(row);  // for now at least there is only one persisted filterObject
            
    request.onsuccess = function(e) {
        console.log("storing session state request.onsuccess");
    };
    
    request.onerror = function(e) {
        console.log(e);
    };
};

/* Handler for by date checkbox. */
tj.toggleDateFilter = function() {
    var dateCheckbox = document.getElementById("filter_by_date").checked;
    var filterDateDiv = document.getElementById("filter_date_div");
    if(dateCheckbox) {
        filterDateDiv.className = "display_block";
    }
    else {
        filterDateDiv.className = "display_none";
    }
    tj.filterObject.filterOnDate = dateCheckbox;
}

/* Handler for by tags checkbox. */
tj.toggleTagFilter = function() {
    var tagCheckbox = document.getElementById("filter_by_tags").checked;
    var filterTagDiv = document.getElementById("filter_tag_div");
    if(tagCheckbox) {
        filterTagDiv.className = "display_block";
        tj.filterObject.filterOnTags = true;
    }
    else {
        filterTagDiv.className = "display_none";
        tj.filterObject.filterOnTags = false;
    }
}


/* Handler for the Filter button. Sets the state of tj.filterObject accordingly and
*  and calls showAllJots, using the filterObject if any filtering is to be done. */
tj.showFilteredJots = function() {

    tj.filterObject.filterTags = tagMgr.getSelectedTags();

    if(!(document.getElementById("filter_by_date").checked || document.getElementById("filter_by_tags").checked)) {
        tj.showAllJots();
    }
    else {  // record radio buttons state separately so user can turn tag filter on/off while keeping or/and state
        tj.filterObject.filterOnTagsOr = document.getElementById("filter_by_tags_or").checked;
        tj.filterObject.filterOnTagsAnd = document.getElementById("filter_by_tags_and").checked;

        tj.showAllJots(tj.filterObject);
    }

    // Persist the filter incase the user closes.
    tj.indexedDB.persistFilterControlsState(tj.filterObject);
}

/* Returns if a jot meets the current tag filter criteria, false otherwise. */
tagMgr.containsTags = function(jot, filterObject) {

    // TODO Allow a search for untagged jots, meaning if there are no tags selected
    // to check jots against we will return true only for untagged jots

    if(filterObject.filterTags === null || filterObject.filterTags.length === 0) {
        if(jot.tagList == "")
            return true;
        else
            return false;
    }
    // On the other hand, if we do have tags to search against and the jot has no tags it can't match
    if(jot.tagList == "") {
        return false;
    }

    var tagsInJot = jot.tagList.split(/,\s*/);
    var present = -1;
    for(var i = 0; i < filterObject.filterTags.length; i++) {

        present = tagsInJot.indexOf(filterObject.filterTags[i]);
        if(filterObject.filterOnTagsOr) {
            if(present != -1)
                return true;
            if(i == filterObject.filterTags.length - 1)
                return false;
        }
        else if(filterObject.filterOnTagsAnd) {
            if(present == -1)
                return false;
        }
    }
    return true;
}

/* A wrapper for tagMgr.innerMerge. */
tagMgr.mergeStagedTags = function() {
    var tagsField = document.getElementById("add_tagsinput");
    var tagString = tagsField.value;

    tagMgr.innerMerge(tagString, tagsField);
}

/*
* Adds or removes tags from the master tag list maintained remotely via NimbusBase, and updates the UI
* select element on the page.
*
* mergeList - a list of tags to add or remove. This is a string of comma separated 'tag phrases' which
*             can contain white space.

*             Tags in the mergeList beginning with '-' indicate tags to be removed from the master
*             list. This means actual tags cannot begin with '-'. For tags not beginning with '-' the
*             tag is added to the master list if it is not already in it.
*
* Note: For now we do not search all jots for use of tags being removed from the master list. Since filtering
*       jots based on tags is based on the master tag list this means that filtering cannot be based on tags
*       that have been removed from the master list. Such orphan tags will still be in any jots they were applied
*       to and would have to be removed manually per jot (using the jot editing feature, which allows for title,
*       tags, and content editing). Alternatively the removed tag could be re-added to the master list and would
*       thus be an available filter target once again.
*/           
tagMgr.innerMerge = function(mergeList, tagsElement) {
    if(mergeList === undefined || mergeList === null || mergeList === "")
        return;

    //********** NEW Tag STUFF FOR MONGODB ***********
    $.getJSON('/tags/taglist', function(data) {

        var existing = [];
        var stringOfTags;

        if(data !== null) {
            stringOfTags = data.tagList;
            if(stringOfTags != undefined && stringOfTags != "")
                existing = stringOfTags.split(",");
        }

        // separate candidates into add and remove categories
        var mergeCands = mergeList.split(",");
        var mergeAdd = [];
        var mergeRemove = [];
        for(var i = 0; i < mergeCands.length; i++) {
            var trimmed = mergeCands[i].trim();
            if(trimmed.substr(0,1) == "-")
                mergeRemove.push(trimmed.substr(1, trimmed.length - 1));
            else
                mergeAdd.push(trimmed);
        }

        //TODO: ISSUE: due to removals being case-insensitive but adds, because it uses .indexOf, doesn't check
        //          case insensitively before adding. Thus we can add mX and MX but either -mX or -MX will
        //          remove both of them.

        // do removals first
        var existingMinusRemoved = [];
        if(existing.length != 0) {    // if no existing tags then there's nothing to remove
            for(var i = 0; i < existing.length; i++) {
                for(var j = 0; j < mergeRemove.length; j++) {
                    if(existing[i].toLowerCase() === mergeRemove[j].toLowerCase())
                    {
                        existing[i] = null;
                        break;
                    }
                }
                if(existing[i] != null)      
                    existingMinusRemoved.push(existing[i]);
            }
        }

        // now additions and sort
        for(var i = 0; i < mergeAdd.length; i++) {
            if(existingMinusRemoved.indexOf(mergeAdd[i]) == -1)
                existingMinusRemoved.push(mergeAdd[i]);
        }
        existingMinusRemoved.sort();

        // update the remote tag list, which might be empty or non-existent
        var tags = existingMinusRemoved.join();
        var taglist = {"userID":userData.userID, "tagList":tags, "extra":"none"};

        $.ajax({
            type: 'POST',
            //type: 'PUT',  //makes more sense but some browsers don't support from inside a form
            data: taglist,
            url: '/tags/addtag',
            dataType: 'JSON'
        }).done(function( response ) {
            var temp = response;
            // Check for successful (blank) response
            if(response.msg === '') {

                // Repopulate the Tags field, sans tags being removed
                tagsElement.value = mergeAdd.join(", ");
            }
            else {
                // If something goes wrong, alert the error messag that our service returned
                alert('Database error updating tags: ' + response.msg);
            }

        }).fail(function(xhr, textStatus, errorThrown) {    // the .error() method is deprecated as of JQuery 1.5
            alert('Sorry: updating the tags failed.\n\nYour login has probably timed out.\n\nPlease try reloading the page and logging in again.');
        });

        tagMgr.populateTagSelector(existingMinusRemoved);
    });
}

/* Places selected tags in Tags text field for jot being added. */
tagMgr.stageTags = function() {
    var textfield = document.getElementById('add_tagsinput');
    textfield.value = tagMgr.getSelectedTags().join(",");
}

/* Returns an array containing the tags currently selected in the tag selector list. */
tagMgr.getSelectedTags = function() {
    var tagSelector = document.getElementById('tagselector');
    var tags = [];
    var n = tagSelector.options.length;
    for(var i = 0; i < n; i++) {
        if(tagSelector.options[i].selected) {
            tags.push(tagSelector.options[i].value)
        }
    }
    return tags;
}

/* Clears the Tags text field for jot being added. */
tagMgr.clearStagedTags = function() {
    var textfield = document.getElementById('add_tagsinput');
    textfield.value = "";
}

/* Selects tags in the tag selector list. Used primarily at page load for restoring session filter state. */
tagMgr.selectTags = function(fromList) {
    if((fromList != undefined) && (fromList != null)) {
        var selector = document.getElementById('tagselector');
        var opts = selector.options;
        for(var i = 0; i < opts.length; i++) {
            if(fromList.indexOf(opts[i].value) != -1)
                opts[i].selected = true;
        }
    }
}

/*
* Populates the Tag Selector list select element on the page with the tags stored on the remote.
*
* fromList - an array of tag strings.
*/
tagMgr.populateTagSelector = function(fromList) {

    var selector = document.getElementById('tagselector');

        // now add however many of these: <option value="tagX">tagX</option>
        selector.innerHTML = "";
        for(var i = 0; i < fromList.length; i++) {
            var newItem = document.createElement("option");
            newItem.setAttribute("id", fromList[i]);
            newItem.setAttribute("value", fromList[i]);
            newItem.innerHTML = fromList[i];
            selector.appendChild(newItem);
        }
}

// Let's get started
window.addEventListener("DOMContentLoaded", tj.indexedDB.open, false);



