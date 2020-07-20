# Adabas TCP

Access to an Adabas Database from Node.js using the Adabas TCP connection.

It offers the classical *CRUD* access methods for Adabas:

* _C_ reate - inserts an new Adabas record
* _R_ ead - read Adabas records
* _U_ pdate - update an Adabas record
* _D_ elete - delete an Adabas record

## Installation

```shell
npm install adabas-tcp
```

## Introduction

This simple example shows how to read all records of file 11 and writes the result to the console:

```typescript
const Adabas = require('adabas-tcp').Adabas;

const adabas = new Adabas('localhost', 60001);
adabas.read({ fnr: 11 }).then( result => {
    console.log(result);
    adabas.close().then(  () => adabas.disconnect() );
});
```

What it does is to read the File Description Table of the file and add all available fields to the format buffer. The result is an array of Javascript objects:

```
[
  { ISN: 1,
    AA: '50005800',
    AB: { AC: 'SIMONE', AE: 'ADAM', AD: '' },
    AF: 'M',
    AG: 'F',
    AH: 712981,
    A1: { AI: [ '26 AVENUE RHIN ET DA' ], AJ: 'JOIGNY', AK: '89300', AL: 'F' },
    A2: { AN: '1033', AM: '44864858' },
    AO: 'VENT59',
    AP: 'CHEF DE SERVICE',
    AQ: [ { AR: 'EUR', AS: 963, AT: [ 138] } ],
    A3: { AU: 19, AV: 5 },
    AW: [ { AX: 19990801, AY: 19990831 } ],
    AZ: [ 'FRE', 'ENG' ]
  },
  { ISN: 2,
...
```

## General

To hide the complexity of an Adabas call with all the buffers, short names and options from the user, this implementation offers a high level API which generates all buffers from the provided metadata.

### Data Representation

The Adabas data is represented as a Javascript object. This means the read method returns a Javascript object and the insert and update methods access a Javascript object as input. Here is an example for the Javascript object for an Employees record:

```javascript
const record = {
    'Personnel Id': '50001234',
    'First Name'  : 'John',
    'Name'        : 'Doe',
    'Middle Name' : 'M.',
    'City'        : 'Seattle',
    'Country'     : 'USA'
};
```

The type of object attributes must match the Adabas types. This means a numeric type in Adabas must be a Javascript type of number. These types are validated during the processing and an error is thrown if there are incompatibilites.

#### Multiple Fields

Multiple fields are represented as arrays.

#### Groups

A group is a Javascript object.

#### Periodic Groups

A periodic group is an array of Javascript objects.

#### Data Representation Example

Below is an example of an object:

```javascript
{
    ISN: 207,
    'Personnel Id': '11100107',
    'Full Name': { 'First Name': 'HELGA', Name: 'SCHMIDT' },
    Name: 'SCHMIDT',
    Language: [ 'GER', 'FRE' ],
    Income:
        [
            { 'Currency Code': 'EUR', Salary: 18461, Bonus: [ 1025, 75] },
            { 'Currency Code': 'EUR', Salary: 16410, Bonus: [] }
        ]
}
```

## Classes

### AdabasMap

The AdabasMap class contains the metadata for the Adabas call.

#### AdabasMap Constructor

The constructor has the file number as parameter.

#### Fields

For each field that is accessed the following information must be provided:

* type (regular field, multiple field, periodic group)
* format
* length
* short name
* options

With the options, the long name, precision, max occurrence, etc. can be provided.

Each Adabas field is defined like this:

```javascript
alpha(8, 'AA', { name: 'Personnel Id' })
```

Meaning that the Adabas field is of type 'alpha', has a length of 8 and the short name is 'AA'. In the returned object the attribute is named 'Personnel Id'.

To add the fields to the map a function must be used. The following functions are implemented:

* alpha (A)
* binary (B)
* fixed (F)
* float (G)
* packed (P)
* unpacked (U)
* wide (W)

Multiple fields must set the 'occ' attribute in the options:

```javascript
alpha(3, 'AZ', { name: 'Language', occ: 5 }) // multiple field
```

For groups another function must be used where instead of the length a map for the group is provided:

```javascript
group(FullName, 'AB', { name: 'FullName' }) // group
```

Periodic groups are similar to groups. The difference is that the 'occ' attribute is set in the options:

```javascript
group(Income, 'AQ', { name: 'Income', occ: 6 }) // periodic group
```

#### Import

##### Typescript

``` javascript
import { Adabas, AdabasMap } from 'adabas-tcp';
```

##### Javascript

``` javascript
const Adabas = require('adabas-tcp').Adabas;
const AdabasMap = require('adabas-tcp').AdabasMap;
```

#### Fields Example

Here is an example for an Employees file (file number 11):

```javascript
// define elements of the periodic group
const Income = new AdabasMap()
    .alpha(3, 'AR', { name: 'Currency Code' })
    .packed(5, 'AS', { name: 'Salary' })
    .packed(5, 'AT', { name: 'Bonus', occ: 5 }) // multiple field within periodic group
    ;

// define a group
const FullName = new AdabasMap()
    .alpha(20, 'AC', { name: 'First Name' })
    .alpha(20, 'AE', { name: 'Name' })
    ;

// define the adabas record
const Map = new AdabasMap(11)
    .alpha(8, 'AA', { name: 'Personnel Id' })
    .group(FullName, 'AB', { name: 'FullName' }) // group
    .alpha(20, 'AE', { name: 'Name' })
    .alpha(3, 'AZ', { name: 'Language', occ: 5 }) // multiple field
    .group(Income, 'AQ', { name: 'Income', occ: 6 }) // periodic group
    ;
```

### Adabas

The *Adabas* class does the Adabas calls.

#### Adabas Constructor

The Adabas class has the database number as a required parameter. Options for multifetch or logging can be added:

```javascript
const adabas = new Adabas('localhost', 49152, { multifetch: 20 } );
```

#### Methods

The *create*, *read*, *update* and *delete* methods need the map or a file number as parameter. If the file number is provided the File Description Table of the file is read and a map containing all fields is created from these definitions.

Each command has some parameters provided as an object to control the command. At least a map or file number must be provided. See examples below.

The following parameters are supported:

```javascript
export interface CallData {
    map?: AdabasMap,
    fnr?: number,
    isn?: number,
    object?: any,
    criteria?: string,
    fields?: string[]
}
```

Here are examples for these methods.

##### create(CallData)

Parameter:

* map/fnr: map or file number
* object: that is stored

Store object 'create' using the map 'empl':

```javascript
adabas.create( { map: empl, object: create } );
```

##### read(CallData)

Parameter:

* map/fnr: map or file number
* criteria: return only objects that meet the criteria
* isn: read a single ISN
* fields[]: limit the returned fields

Read all data from file 11:

```javascript
adabas.read( { fnr: 11 } );
```

Read ISN 207 using the map 'empl':

```javascript
adabas.read( { map: empl, isn: 207 } );
```

##### update(CallData)

Parameter:

* map/fnr: map or file number
* criteria: return only objects that meet the criteria
* object: that is stored

Update the corresponding record where 'Personnel Id' equals 'Test1234' with object 'update':

```javascript
adabas.update( { map: empl, criteria: 'Personnel Id=Test1234', object: update } );
```

##### delete(CallData)

Parameter:

* map/fnr: map or file number
* criteria: return only objects that meet the criteria

Delete record where 'Personnel Id' equals 'Test1234':

```javascript
adabas.delete( {map: empl, criteria: 'Personnel Id=Test1234' } );
```

##### endTransaction()

Performs an end of transaction. The data is committed to the database.

##### backoutTransaction()

Performs a backout of this transaction.

##### close()

Performs a close of the database.

## Know Problems

* Alpha fields with length 0 and LOB fields are currently not supported.

## Dislaimer

Utilities and samples shown here are not official parts of the Software AG products. These utilities and samples are not eligible for technical assistance through Software AG Global Support. Software AG makes no guarantees pertaining to the functionality, scalability , robustness, or degree of testing of these utilities and samples. Customers are strongly advised to consider these utilities and samples as "working examples" from which they should build and test their own solutions.
