/// <reference path="./typings/node/node.d.ts"/>
/// <reference path="./typings/mocha/mocha.d.ts"/>
/// <reference path="./typings/lodash/lodash.d.ts" />

"use strict";

//TODO process substanceAdministration/performer
// Startup file for debugging
var fs = require('fs');
var _ = require("lodash");
var jsonave = require('jsonave').instance;
var json2json = require('jsonapter').instance();

var bbcms = require("./index");

function renameProperty(object, oldName, newName) {
    if (object && oldName !== newName) {
        if (object.hasOwnProperty(oldName)) {
            object[newName] = object[oldName];
            delete object[oldName];
        }
        return object;
    }
}

function massRename(root) {
    if (root) {

        var tmp = root["$children"];
        //console.log("in massRename" + ((tmp)?"+":"-") + ((tmp.length > 0)?"+":"-"));

        if (tmp && tmp.length > 0) {
            tmp.forEach(function (value, idx, arr) {
                massRename(value);
                return true;
            });
        }

        if (tmp &&
            (tmp.length === 0 ||
                (tmp.length === 1 && tmp[0] === root["$text"]))) {
            renameProperty(root, "$text", root["$name"]);
            //delete root["$name"];
            delete root["$children"];
        }
        /*if (root["$"]) {
            renameProperty(root, "$", root["$name"]);
            delete root["$name"];
        } else if (root["$text"]) {
            renameProperty(root, "$text", root["$name"]);
            delete root["$name"];
        } else if(root["$children"]) {
            renameProperty(root, "$children", root["$name"]);
            delete root["$name"];
        }*/

        //console.log("out massRename");
    }
    return root;
}

var template = {
    content: {
        resourceType: 'Patient',
        identifier: {
            /*value: {
                content: {
                    system: {
                        value: function(input) { return 'urn:oid:' + input },
                        dataKey: 'root'
                    },
                    value: {
                        dataKey: 'extension'
                    }

                }
            },*/
            //dataKey: jsonave("$['$children'][?(@.$name ==='recordTarget')]['$children'][?(@.$name ==='patientRole')]['$children'][?(@.$name ==='id')]['$']")
            dataKey: '$name'
        }
    }
};

console.time("parse");

var istream = fs.createReadStream(__dirname + '/test/artifacts/bluebutton-01-original.xml', 'utf-8');

var obj = new bbcms.CdaParser(istream);

obj.preserve('ClinicalDocument');

obj.on('endElement: ClinicalDocument', function (item) {
    //fs.writeFile('test.json', JSON.stringify(massRename(item), null, '  '));
    //fs.writeFile('test.json', JSON.stringify( item ,null,'  '));
    console.timeEnd("parse");

    console.time("transfrom");
    var i, max = 1;
    for (i = 0; i < max; i++) {
        var j = json2json.run(template, item);
    }
    console.timeEnd("transfrom");
    console.log(j);
});

var getResource = function (resType, slot) {
    var res = {
        'resource': {
            'resourceType': resType
        }
    };
    if (slot) {
        if (!slot[resType]) {
            slot[resType] = [];
        }
        slot[resType].push(res);
    }
    return res;
};

var serial = 0;

var findPatient = function (bundle) {
    var patient;
    _.each(bundle.entry, function (value) {
        if (value.resource.resourceType === 'Patient') {
            patient = value.resource;
            return false;
        }
        return true;
    });
    return patient;
};

var dateFix = function(date) {
  if(date && date.length === 8) {
      return date.substr(0,4) + '-' + date.substr(4,2) + '-' + date.substr(6,2);
  }  else {return date;}
};

var makeCode = function(node) {
    var retval = {
            'system': ((/[\d\.]+/.test(node.attributes.codeSystem))?'urn:oid:' + node.attributes.codeSystem:node.attributes.codeSystem) ,
            'code': node.attributes.code,
            'display': node.attributes.displayName
        };
        return retval;
};

    /** Check/create property of an object */
var ensureProperty = function (prop, isArray) {
        if (!this[prop]) {
            this[prop] = (isArray) ? [] : {};
        }
        return this[prop];
    };
    
    
var     findResource = function (id) {
           var resource;

           _.each( this, function(value) {
               if(value.resource.id === id) {
                   resource = value.resource;
                   return false;
               }
               return true;
           });
           return resource;   
    };
    
var makeTransactionalBundle = function(bundle, base) {
    _.each( bundle.entry, function(value) {
        value.transaction = {
            'method': 'POST',
            'url' : value.resource.resourceType
        };
        value.base = base;
    });
    return bundle;
};  
 
//Make it common root
var proto = {
    tags: [], // Stack of XML tags processed
    //control: [last],
    controlTag: [],
    bundle: {},
    composite: {},

    findPatient: function () {
        var patient;
        _.each(proto.bundle.entry, function (value) {
            if (value.resource.resourceType === 'Patient') {
                patient = value.resource;
                return false;
            }
            return true;
        });
        return patient;
    },
    obj: function () {
        return this;
    },
    
       id : function(node) {
        if(node.attributes.nullFlavor == 'NI') return;
        ensureProperty.call(this, 'identifier', true).push({
            'system': 'urn:oid:' + node.attributes.root,
            'value': node.attributes.extension
        });
    }
};

//last.prototype = proto;

//CatchAll element
var Dummy = function () {

};

Dummy.prototype = proto;

var dummy = new Dummy();

var Organization = function (organization) {

    this.name$ = function (text) {
        organization.name = text;
    };
    
    this.telecom = function (node) {
            if(node.attributes.nullFlavor == 'UNK') return;
        ensureProperty.call(organization, 'telecom', true).push({
            'use': node.attributes.use,
            'value': node.attributes.value
        });
    };

     this.addr = function (node) {
        if(node.attributes.nullFlavor == 'UNK') return;
        var address = {
            'use': node.attributes.use
        };
        ensureProperty.call(organization,'address', true).push(address);

        proto.control.push(new Addr(address));
        proto.controlTag.push(node.name);
      };
      
};
Organization.prototype = proto;


/**
 * AKA assignedAuthor
 */
var AssignedEntity = function(practitioner) {
    var _practitioner = practitioner;
    
    this.addr = function(node) {
        if(node.attributes.nullFlavor == 'UNK') return;
        var address = {
            'use': node.attributes.use
        };
        ensureProperty.call(_practitioner,'address', true).push(address);

        proto.control.push(new Addr(address));
        proto.controlTag.push(node.name);
    };
    
    this.telecom = function (node) {
        if(node.attributes.nullFlavor == 'UNK') return;
        ensureProperty.call(_practitioner, 'telecom', true).push({
            'use': node.attributes.use,
            'value': node.attributes.value
        });
    };
    
    this.representedOrganization = function(node) {
         var organization = {
            'resourceType': 'Organization',
            'id': 'Organization/' + (serial++).toString()
        };
        _practitioner.managingOrganization = {
            'reference': organization.id
        };
        ensureProperty.call(_practitioner,'contained',true).push(organization);
        ensureProperty.call(_practitioner,'practitionerRole',true).push( {'managingOrganization': {'reference': organization.id}});
        proto.control.push(new Organization(organization));
        proto.controlTag.push(node.name);
    };
    
    this.assignedPerson = function(node) {
        if(node.attributes.nullFlavor == 'UNK') return;
        proto.control.push(new AssignedPerson(_practitioner));
        proto.controlTag.push(node.name);
    };
};
AssignedEntity.prototype = proto;

var Performer = function (medicationAdministration) {
    var _medicationAdministration = medicationAdministration;
    
    this.assignedEntity = function(node) {
        var practitioner = {'resourceType': 'Practitioner', 'id': 'Practitioner/' + (serial++).toString()};
        
        ensureProperty.call(_medicationAdministration,'contained',true).push(practitioner);
        _medicationAdministration.practitioner = {'reference': practitioner.id};
        proto.control.push(new AssignedEntity(practitioner));
        proto.controlTag.push(node.name);
    };
};
Performer.prototype = proto;

var ManufacturedMaterial = function (medication) {
    var _medication = medication;

    this.code = function (node) {
        //TODO - make a deeper analysis
        _medication.name = node.attributes.displayName;
        _medication.code = {
            'coding': [makeCode(node)]
        };
    };
};
ManufacturedMaterial.prototype = proto;

var ManufacturedProduct = function (medication) {
    var _medication = medication;

    this.manufacturedMaterial = function (node) {
        proto.control.push(new ManufacturedMaterial(_medication));
        proto.controlTag.push(node.name);
    };

    this.manufacturerOrganization = function (node) {
        if (!medication.contained) {
            _medication.contained = [];
        }
        var organization = {
            'resourceType': 'Organization',
            'id': 'Organization/' + (serial++).toString()
        };
        _medication.manufacturer = {
            'reference': organization.id
        };
        _medication.contained.push(organization);
        proto.control.push(new Organization(organization));
        proto.controlTag.push(node.name);
    };
};
ManufacturedProduct.prototype = proto;

var Consumable = function (bundle, composition, medicationStatement) {
    var _bundle = bundle;
    var _composition = composition;
    var _medicationStatement = medicationStatement;

    this.manufacturedProduct = function (node) {

        var medication = {
            'resourceType': 'Medication',
            'id': 'Medication/' + (serial++).toString()
        };
        _bundle.entry.push({
            'resource': medication
        });
        _medicationStatement.medication = {
            'reference': medication.id
        };
        proto.control.push(new ManufacturedProduct(medication));
        proto.controlTag.push(node.name);
    };
};
Consumable.prototype = proto;

var EffectiveTime = function (subType, object) {
    var _subType = subType;
    var _object = object;

    this.low = function (node) {
        _object.start = dateFix( node.attributes.value);
    };

    this.high = function (node) {
        _object.end = dateFix(node.attributes.value);
    };

    this.period = function (node) {
        _object.schedule.repeat.period = node.attributes.value;
        _object.schedule.repeat.periodUnits = node.attributes.unit;
    };
};
EffectiveTime.prototype = proto;

var Observation = function( condition) {
    var _condition = condition;

    this.code = function(node) {
        _condition.category = {            'coding': makeCode(node)
};

    };
    
    this.statusCode = function(node) {
        //TODO recode to FHIR
        _condition.clinicalStatus = node.attributes.code;
    };
    
    this.effectiveTime = function(node) {
        var subType = node.attributes['xsi:type'];
        switch (subType) {
                case 'IVL_TS':
            if (!_condition.onsetPeriod) {
                _condition.onsetPeriod = {};
            }
            proto.control.push(new EffectiveTime(subType, _condition.onsetPeriod));
            break;
        default:
            proto.control.push(dummy);
            break;
        }
        proto.controlTag.push(node.name);
    };
    
    this.value = function(node) {
        //TODO any other xsi:type ? 
        if( node.attributes['xsi:type'] === 'CD') {
        _condition.code =  {'coding': [ makeCode(node)]};
        }
    };
    
};
Observation.prototype = proto;

var Product = function (bundle, composition, medicationPrescription) {
    var _bundle = bundle;
    var _composition = composition;
    var _medicationPrescription = medicationPrescription;

    this.manufacturedProduct = function (node) {

        var medication = {
            'resourceType': 'Medication',
            'id': 'Medication/' + (serial++).toString()
        };
        _bundle.entry.push({
            'resource': medication
        });
        _medicationPrescription.medication = {
            'reference': medication.id
        };
        proto.control.push(new ManufacturedProduct(medication));
        proto.controlTag.push(node.name);
    };
};
Product.prototype = proto;

var Author  = function(bundle, composition, medicationPrescription) {
    var _bundle = bundle;
    var _composition = composition;
    var _medicationPrescription = medicationPrescription;

    /* TODO check the standard on a time flavors
    this.time = function(node) {
        
    };*/
    
    this.assignedAuthor = function(node) {
        var practitioner = {'resourceType': 'Practitioner', 'id': 'Practitioner/' + (serial++).toString()};       
        ensureProperty.call(_medicationPrescription,'contained',true).push(practitioner);
        _medicationPrescription.practitioner = {'reference': practitioner.id};
        proto.control.push(new AssignedEntity(practitioner));
        proto.controlTag.push(node.name);
    };
    
};
Author.prototype = proto;

var Supply = function(bundle, composition, medicationPrescription) {
    var _bundle = bundle;
    var _composition = composition;
    var _medicationPrescription = medicationPrescription;
    
    this.statusCode = function(node) {
        // TODO Recode?
        _medicationPrescription.status = node.attributes.code;
    };
    
    this.effectiveTime = function(node) {
        var subType = node.attributes['xsi:type'];
        switch (subType) {
        case 'IVL_TS':
        console.log('???',_medicationPrescription);
            ensureProperty.call(ensureProperty.call(_medicationPrescription,'dispense'), 'validityPeriod');
            proto.control.push(new EffectiveTime(subType, _medicationPrescription.dispense.validityPeriod));
            break;
        default:
            proto.control.push(dummy);
            break;
        }
        proto.controlTag.push(node.name);    
        };
        
       this.repeatNumber = function(node) {
           ensureProperty.call(_medicationPrescription,'dispense').numberOfRepeatsAllowed = node.attributes.value;
       };
       
       this.quantity = function(node) {
           ensureProperty.call(_medicationPrescription,'dispense').quantity = {'value': node.attributes.value};
       };
       
       this.product = function(node) {
                   proto.control.push(new Product(_bundle, _composition, _medicationPrescription));
        proto.controlTag.push(node.name);
       };
       
       /* TODO Find out semantic of this
       this.performer = function(node) {  
       };*/
       
       this.author = function(node) {
                   proto.control.push(new Author(_bundle, _composition, _medicationPrescription));
        proto.controlTag.push(node.name);
       };
       
       /* TODO Wrapper for additional instructions
       this.entryRelationship = function(node) {  
       };*/
};
Supply.prototype = proto;

var EntryRelationship = function(bundle, composition, medicationAdministration) {
    var _bundle = bundle;
    var _composition = composition;
    var _medicationAdministration = medicationAdministration;
   
    this.observation = function(node) {
        var _patient = findPatient(_bundle);
        var condition = {'resourceType': 'Condition', 'id': 'Condition/' + (serial++).toString(), 'patient': {
            'reference': _patient.id
        }};
        _medicationAdministration.reasonForUseReference = {'reference': condition.id};
        _bundle.entry.push({
            'resource':condition});
        _composition.section.push({
        'subject': {
            'reference': _patient.id
        },
        'content': {
            'reference': condition.id
        }
    });
            
        proto.control.push(new Observation(condition));
        proto.controlTag.push(node.name);
    };
    
    this.supply =  function(node) {
        var medicationPrescription;
        if( !_medicationAdministration.prescription ) {
            var _patient = findPatient(_bundle);
            medicationPrescription = {'resourceType' : 'MedicationPrescription', 'id': 'MedicationPrescription/' + (serial++).toString()};
                    _bundle.entry.push({
            'resource':medicationPrescription});
        _composition.section.push({
        'subject': {
            'reference': _patient.id
        },
        'content': {
            'reference': medicationPrescription.id
        }
    });
    _medicationAdministration.medicationPrescription = {'reference': medicationPrescription.id};
        }
        if(!medicationPrescription) {
            //console.log('1>>>>',_medicationAdministration.prescription.reference);
            medicationPrescription = findResource.call( _bundle.entry, _medicationAdministration.prescription.reference);
            //console.log('2>>>>',medicationPrescription);
        }
        proto.control.push(new Supply(_bundle, _composition, medicationPrescription));
        proto.controlTag.push(node.name);
    };
    
};
EntryRelationship.prototype = proto;


var SubstanceAdministration = function (bundle, composition) {
    var _bundle = bundle;
    var _composition = composition;
    var _patient = findPatient(_bundle);

    var _medicationPrescription = {
        'resourceType': 'MedicationPrescription',
        'id': 'MedicationPrescription/' + (serial++).toString(),
        'patient': {
            'reference': _patient.id
        },
        'dosageInstruction': []
    };
    var _medicationAdministration = {
        'resourceType': 'MedicationAdministration',
        'id': 'MedicationAdministration/' + (serial++).toString(),
        'patient': {
            'reference': _patient.id
        },
        'prescription': {
            'reference': _medicationPrescription.id
        },
        'dosage': []
    };

    _bundle.entry.push({
        'resource': _medicationPrescription
    });
    _composition.section.push({
        'subject': {
            'reference': _patient.id
        },
        'content': {
            'reference': _medicationPrescription.id
        }
    });

    _bundle.entry.push({
        'resource': _medicationAdministration
    });
    _composition.section.push({
        'subject': {
            'reference': _patient.id
        },
        'content': {
            'reference': _medicationAdministration.id
        }
    });

    function getDosage() {
        var dosage = _.last(_medicationAdministration.dosage);
        if (!dosage) {
            dosage = {
                'schedule': {
                    'repeat': {}
                }
            };
            _medicationAdministration.dosage.push(dosage);
        }
        return dosage;
    }

    this.statusCode = function (node) {
        _medicationAdministration.status = node.attributes.code;
    };

    this.effectiveTime = function (node) {
        var subType = node.attributes['xsi:type'];
        switch (subType) {
        case 'IVL_TS':
            if (!_medicationAdministration.effectiveTimePeriod) {
                _medicationAdministration.effectiveTimePeriod = {};
            }
            proto.control.push(new EffectiveTime(subType, _medicationAdministration.effectiveTimePeriod));
            break;
        case 'PIVL_TS':
            var scheduledTiming = {
                'schedule': {
                    'repeat': {}
                }
            };
            _medicationPrescription.dosageInstruction.push(scheduledTiming);
            proto.control.push(new EffectiveTime(subType, scheduledTiming));
            break;
        default:
            proto.control.push(dummy);
            break;
        }
        proto.controlTag.push(node.name);
    };

    this.routeCode = function (node) {
        var dosage = getDosage();
        dosage.route = {
            'coding': makeCode(node)
        };
    };

    this.doseQuantity = function (node) {
        var dosage = getDosage();
        dosage.quantity = {
            'value': node.attributes.value,
            'units': node.attributes.unit
        };
    };

    this.rateQuantity = function (node) {
        var dosage = getDosage();
        dosage.rate = {
            'numerator': {
                'value': node.attributes.value,
                'units': node.attributes.unit
            }
        };
    };

    this.maxDoseQuantity = function (node) {
        if (node.attributes.nullFlavor) {
            proto.control.push(dummy);
            proto.controlTag.push(node.name);
        } else {
            var dosage = getDosage();
            proto.control.push(dummy); //TODO make dose quanty parser
            proto.controlTag.push(node.name);
        }
    };

    this.administrationUnitCode = function (node) {
        var dosage = getDosage();
        dosage.method = {
            'coding': makeCode(node)
        };
    };

    this.consumable = function (node) {
        proto.control.push(new Consumable(_bundle, _composition, _medicationAdministration));
        proto.controlTag.push(node.name);
    };
    
    this.performer = function (node) {
        proto.control.push(new Performer( _medicationAdministration));
        proto.controlTag.push(node.name);
    };
    
    //TODO this.participant - unclear mapping
    this.entryRelationship = function (node) {
        proto.control.push(new EntryRelationship(_bundle, _composition, _medicationAdministration));
        proto.controlTag.push(node.name);
    };
    
};
SubstanceAdministration.prototype = proto;

var Entry = function (bundle, composition) {
    var _bundle = bundle;
    var _composition = composition;

    this.substanceAdministration = function (node) {
        proto.control.push(new SubstanceAdministration(_bundle, _composition));
        proto.controlTag.push(node.name);
    };
};
Entry.prototype = proto;

var Section= function (bundle, composition) {
    var _bundle = bundle;
    var _composition = composition;

    this.entry = function (node) {
        proto.control.push(new Entry(_bundle, _composition));
        proto.controlTag.push(node.name);
    };
};
Section.prototype = proto;

var StructuredBody = function (bundle, composition) {
    var _bundle = bundle;
    var _composition = composition;

    this.component = function (node) {
        proto.control.push(new Component(_bundle, _composition));
        proto.controlTag.push(node.name);
    };
};
StructuredBody.prototype = proto;

var Component = function (bundle, composition) {
    var _bundle = bundle;
    var _composition = composition;

    this.structuredBody = function (node) {
        proto.control.push(new StructuredBody(_bundle, _composition));
        proto.controlTag.push(node.name);
    };

    this.section = function (node) {
        proto.control.push(new Section(_bundle, _composition));
        proto.controlTag.push(node.name);
    };
};
Component.prototype = proto;

var Name = function (name) {
    var _name = name;

    this.given$ = function (text) {
        if (!_name.given) {
            _name.given = [];
        }
        _name.given.push(text);
    };

    this.family$ = function (text) {
        if (!_name.family) {
            _name.family = [];
        }
        _name.family.push(text);
    };
};
Name.prototype = proto;

var SomeWithName = function( some) {
    var _some = some;

    this.name = function (node) {
        if (!_some.name) {
            _some.name = [];
        }
        var name = {
            'use': node.attributes.use
        };
        _some.name.push(name);

        proto.control.push(new Name(name));
        proto.controlTag.push(node.name);
    };    
};
SomeWithName.prototype = proto;

var Place = function(address) {
    var _address = address;
  
    this.addr = function(node) {
                proto.control.push(new Addr(_address));
        proto.controlTag.push(node.name);        
    }  ;
};
Place.prototype = proto;

var BirthPlace = function(address) {
    var _address = address;
  
    this.place = function(node) {
                proto.control.push(new Place(_address));
        proto.controlTag.push(node.name);        
    }  ;
};
BirthPlace.prototype = proto;

var LanguageCommunication =function (communication) {
    var _communication = communication;
    
    this.languageCode = function(node) {
        _communication.language = {
            'coding':{
                'code': node.attributes.code
            }
        }; 
    };
    
    this.preferenceInd = function(node) {
        _communication.preferred = node.attributes.value;
    };
};
LanguageCommunication.prototype = proto;

var GuardianPerson =  function(contact) {
    SomeWithName.call(this, contact);
};
GuardianPerson.prototype = new SomeWithName(null);


var Guardian = function(contact) {
        
    this.code = function(node) {
        contact.relationship = [
            {'coding': [
                {
                'system': 'urn:oid:' + node.attributes.codeSystem,
                'code': node.attributes.code,
                'display': node.attributes.displayName
                }
            ]}
        ];  
    };
    
    this.addr = function(node) {
      contact.address = {};
        proto.control.push(new Addr(contact.address));
        proto.controlTag.push(node.name);    
    };
    
    this.telecom = function(node) {
        ensureProperty.call(contact, 'telecom', true).push({
            'use': node.attributes.use,
            'value': node.attributes.value
        });
    };
    
    this.guardianPerson = function(node) {
        proto.control.push(new GuardianPerson(contact));
        proto.controlTag.push(node.name);    
    };
    
};
Guardian.prototype = proto;


var Patient = function (patient) {
    SomeWithName.call(this, patient);
    
    var _patient = patient;
    
    this.administrativeGenderCode = function(node) {
        _patient.gender = node.attributes.code;
    };
    
    this.birthTime = function(node) {
        _patient.birthDate = dateFix(node.attributes.value);
    };
    this.maritalStatusCode = function(node) {
        _patient.maritalStatus = {coding : makeCode(node)};
    };
    this.religiousAffiliationCode = function(node) {
        ensureProperty.call( _patient, 'extension',true).push(
            {'url': 'http://hl7.org/fhir/StructureDefinition/us-core-religion',
             'valueCodeableConcept': {
                 'coding': [
                     {'system': 'urn:oid:' + node.attributes.codeSystem,
                         'code': node.attributes.code,
                         'display': node.attributes.displayName}
                 ]
             }}
        );
    };
    this.raceCode = function(node) {
        ensureProperty.call( _patient, 'extension',true).push(
            {'url': 'http://hl7.org/fhir/Profile/us-core#race',
             'valueCodeableConcept': {
                 'coding': [
                     {'system': 'urn:oid:' + node.attributes.codeSystem,
                         'code': node.attributes.code,
                         'display': node.attributes.displayName}
                 ]
             }}
        );    };
    this.ethnicGroupCode = function(node) {
        ensureProperty.call( _patient, 'extension',true).push(
            {'url': 'http://hl7.org/fhir/Profile/us-core#ethnicity',
             'valueCodeableConcept': {
                 'coding': [
                     {'system': 'urn:oid:' + node.attributes.codeSystem,
                         'code': node.attributes.code,
                         'display': node.attributes.displayName}
                 ]
             }}
        );        
    };
    
    this.guardian = function(node) {
        var contact = {};
        ensureProperty.call(_patient,'contact',true).push(contact);
        proto.control.push(new Guardian(contact));
        proto.controlTag.push(node.name);    
    };

    this.birthplace = function(node) {
        var address = {};
        ensureProperty.call( _patient, 'extension',true).push(
            {'url': 'http://hl7.org/fhir/StructureDefinition/birthPlace',
             'valueAddress': address 
            }
        );
                proto.control.push(new BirthPlace(address));
        proto.controlTag.push(node.name);
    };
    this.languageCommunication = function(node) {
        var communication = {};
        ensureProperty.call(_patient,'communication',true).push(communication);
                proto.control.push(new LanguageCommunication(communication));
        proto.controlTag.push(node.name);    };
};
Patient.prototype = new SomeWithName(null);

var AssignedPerson= function (patient) {
    SomeWithName.call(this, patient);
};
AssignedPerson.prototype = new SomeWithName(null);

var Addr = function (address_) {
    var address = address_;

    this.streetAddressLine$ = function (text) {
        if (!address.line) {
            address.line = [];
        }
        address.line.push(text);
    };

    this.city$ = function (text) {
        address.city = text;
    };

    this.state$ = function (text) {
        address.state = text;
    };

    this.postalCode$ = function (text) {
        address.postalCode = text;
    };

    this.country$ = function (text) {
        address.country = text;
    };

};
Addr.prototype = proto;


var PatientRole = function (patient) {
    var _patient = patient;

    this.id = function (node) {
        if (!_patient.identifier) {
            _patient.identifier = [];
        }
        _patient.identifier.push({
            'system': 'urn:oid:' + node.attributes.root,
            'value': node.attributes.extension
        });
    };

    this.addr = function (node) {
        var address = {
            'use': node.attributes.use
        };
        if (!_patient.address) {
            _patient.address = [address];
        }
        proto.control.push(new Addr(address));
        proto.controlTag.push(node.name);
    };

    this.telecom = function (node) {
        if (!_patient.telecom) {
            _patient.telecom = [];
        }
        _patient.telecom.push({
            'use': node.attributes.use,
            'value': node.attributes.value
        });
    };

    this.patient = function (node) {
        proto.control.push(new Patient(_patient));
        proto.controlTag.push(node.name);
    };
    
    this.providerOrganization = function(node) {
         var organization = {
            'resourceType': 'Organization',
            'id': 'Organization/' + (serial++).toString()
        };
        _patient.managingOrganization = {
            'reference': organization.id
        };
        ensureProperty.call(_patient,'contained',true).push(organization);
        proto.control.push(new Organization(organization));
        proto.controlTag.push(node.name);
    };
};
PatientRole.prototype = proto;

var RecordTarget = function (patient) {

    this.patientRole = function (node) {

        proto.control.push(new PatientRole(patient));
        proto.controlTag.push(node.name);
    };
};
RecordTarget.prototype = proto;

var ClinicalDocument =function  () {
    var bundle = {
        'resourceType': 'Bundle'
    };

    var composition = {
        'resourceType': 'Composition',
        'id': 'Composition/' + (serial++).toString(),
        'section': []
    };

    var patients = [];

    bundle.entry = [{
        'resource': composition
    }];

    this.id = function (node) {
        bundle['id'] = 'urn:hl7ii:' + node.attributes.root + ':' + node.attributes.extension
    };

    this.code = function (node) {
        composition['type'] = {
            'coding': [makeCode(node), {
                'system': node.attributes.codeSystemName,
                'code': node.attributes.code
            }]
        };
    };

    this.title = function (node) {
        composition['title'] = text;
    };

    this.recordTarget = function (node) {

        var patient = {
            'resourceType': 'Patient',
            'id': 'Patient/' + (serial++).toString()
        };
        patients.push(patient);

        bundle.entry.push({
            resource: patient
        });

        proto.control.push(new RecordTarget(patient));
        proto.controlTag.push(node.name);
    };

    /* TODO try tocapture non-clinical information like 
    author, 
    dataEneterer, 
    informant, 
    custodian, 
    informationRecipient, 
    legalAuthenticator, 
    authenticator & documentationOf  */

    this.component = function (node) {
        proto.control.push(new Component(bundle, composition));
        proto.controlTag.push(node.name);
    };

    this.get = function () {
        return bundle;
    };
};
ClinicalDocument.prototype = proto;

var Start = function  () {
    var _clinicalDocument = new ClinicalDocument();

    this.ClinicalDocument = function (node) {
        proto.control.push(_clinicalDocument);
        proto.controlTag.push(node.name);
    };

    this.get = function () {
        return _clinicalDocument.get();
    };
};
Start.prototype = proto;


var last = new Start();
proto.control = [last];

/*var slot = {}; // Collection of resources
var tags = []; // Stack of XML tags processed
var last = new Start();
var control = [last];
var controlTag = [];*/
var text;

// stream usage
// takes the same options as the parser
var saxStream = require("sax").createStream(true, {
    'trim': true
});
saxStream.on("error", function (e) {
    // unhandled errors will throw, since this is a proper node
    // event emitter.
    console.error("error!", e);
    // clear the error
    this._parser.error = null;
    this._parser.resume();
});

saxStream.on("opentag", function (node) {
    console.log("opentag", node.name);
    //Skip node if it contains nullFlavor attribute
    if ( true/*!node.attributes.nullFlavor*/) {
        //Peek item from top of stack
        var doc = _.last(proto.control);
        //Trying to get processing handler
        if (doc) {
            //console.log('????',doc);
            var self = doc.obj();
            var handler = self[node.name];
            if (handler) {
                handler.call(self,node); //Process node
            } else {
                if (!node.isSelfClosing && !self[node.name + '$']) {
                    console.log("pushing dummy ", node.name);
                    proto.control.push(dummy);
                    proto.controlTag.push(node.name);
                }
            }
        } else {
            console.log('++++', node);
        }
    } else {
        proto.control.push(dummy);
        proto.controlTag.push(node.name);
    }

    proto.tags.push(node);
});

saxStream.on("closetag", function (tagname) {
    console.log("closetag", tagname);
    //Peek item from top of stack
    var doc = _.last(proto.control);
    if (doc) {
        //Trying to get processing handler
        var handler = doc.obj()[tagname + '$'];
        if (handler) {
            handler(text); //Process node
        }
    } else {
        console.log('----', tagname);
    }
    //Check the 'control stack' and remove top itemm if we done
    if (_.last(proto.controlTag) === tagname) {
        proto.control.pop();
        proto.controlTag.pop();
    }

    proto.tags.pop();
});

/*saxStream.on("attribute", function (node) {
  console.log("attribute", node);
});*/

saxStream.on("text", function (node) {
    //console.log("text", node);
    text = node;
});

saxStream.on("end", function () {
    //control.pop();
    //tags.pop(); 
    console.log(proto.control.length);
    console.log(JSON.stringify( makeTransactionalBundle(last.get(),'http://localhost:8080/fhir/base'), null, ' '));
});

// pipe is supported, and it's readable/writable
// same chunks coming in also go out.
fs.createReadStream(__dirname + '/test/artifacts/bluebutton-01-original.xml')
    .pipe(saxStream)
    .pipe(fs.createWriteStream("file-copy.xml"));
